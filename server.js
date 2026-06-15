const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};
const PIXABAY_KEY = "56312154-50a7e60c89bbca8e2ec16e16f";

const voices = {
  "pt": "pt-BR-FranciscaNeural",
  "en": "en-US-JennyNeural",
  "es": "es-ES-ElviraNeural"
};

function cleanOldFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
      if (file.startsWith("audio_") || file.startsWith("audio_dl_") ||
          file.startsWith("video_") || file.startsWith("img") || file.endsWith(".srt")) {
        try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) {}
      }
    });
    console.log("Cache removido.");
  } catch (e) {}
}

cleanOldFiles();

app.get("/", (req, res) => {
  res.json({ success: true, service: "ViralFlowAI", status: "online" });
});

app.post("/tts", (req, res) => {
  const text = req.body.text;
  const lang = req.body.lang || "pt";

  if (!text || !String(text).trim()) {
    return res.status(400).json({ success: false, error: "text required" });
  }

  const voice = voices[lang] || voices["pt"];
  const filename = "audio_" + Date.now() + ".mp3";
  const safeText = String(text).replace(/"/g, '\\"').replace(/\r/g, " ").replace(/\n/g, " ");

  const cmd = `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${filename}"`;

  console.log("Gerando áudio...");

  exec(cmd, (error) => {
    if (error) {
      console.log(error.message);
      return res.status(500).json({ success: false, error: "Erro ao gerar áudio" });
    }
    try {
      if (!fs.existsSync(filename)) throw new Error("Arquivo não criado");
      const stats = fs.statSync(filename);
      if (stats.size < 5000) throw new Error("Áudio inválido");
      res.json({ success: true, audio_url: "https://" + req.get("host") + "/" + filename });
    } catch (err) {
      try { fs.unlinkSync(filename); } catch (e) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

function fetchPixabayImages(query, count) {
  return new Promise((resolve, reject) => {
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${count}&order=popular`;
    
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const images = json.hits.map(hit => hit.largeImageURL).slice(0, count);
          resolve(images);
        } catch (e) {
          reject(new Error("Erro Pixabay: " + e.message));
        }
      });
    }).on("error", reject);
  });
}

function getAudioDuration(filename) {
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:noprint_sections=1 "${filename}"`, { encoding: 'utf8' });
    return parseFloat(output.trim());
  } catch (e) {
    return 0;
  }
}

function generateSRT(script, duration) {
  const chunks = script.split(/[.!?]+/).filter(s => s.trim());
  if (chunks.length === 0) return "";

  let srt = "";
  const timePerChunk = duration / chunks.length;
  
  chunks.forEach((chunk, i) => {
    const start = i * timePerChunk;
    const end = (i + 1) * timePerChunk;
    
    const formatTime = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    
    srt += `${i + 1}\n${formatTime(start)} --> ${formatTime(end)}\n${chunk.trim()}\n\n`;
  });
  
  return srt;
}

app.post("/create-video", async (req, res) => {
  const audioUrl = req.body.audioUrl;
  const script = req.body.script || "";
  const topic = req.body.topic || "nature";
  const imageCount = Math.max(10, req.body.imageCount || 12);

  if (!audioUrl) return res.status(400).json({ success: false, error: "audioUrl required" });

  const jobId = "job_" + Date.now();
  jobs[jobId] = { status: "processing", video_url: null, error: null };

  res.json({ success: true, job_id: jobId, status: "processing" });

  setImmediate(async () => {
    try {
      const audioFile = "audio_dl_" + Date.now() + ".mp3";
      const videoName = "video_" + Date.now() + ".mp4";
      const srtFile = "subs_" + Date.now() + ".srt";
      const host = req.get("host");

      console.log("Baixando áudio...");
      execSync(`curl -L --fail --max-time 30 "${audioUrl}" -o "${audioFile}"`);
      
      const audioStats = fs.statSync(audioFile);
      if (audioStats.size < 5000) throw new Error("Áudio inválido");
      
      const duration = getAudioDuration(audioFile);
      console.log("Duração do áudio:", duration.toFixed(2), "segundos");

      console.log("Buscando imagens no Pixabay...");
      const images = await fetchPixabayImages(topic, imageCount);
      if (images.length < 3) throw new Error("Pixabay retornou poucas imagens");
      
      console.log("Baixando " + images.length + " imagens...");
      for (let i = 0; i < images.length; i++) {
        execSync(`curl -L --fail --max-time 30 "${images[i]}" -o "img${i}.jpg"`);
        if (!fs.existsSync(`img${i}.jpg`)) throw new Error("Falha na imagem " + i);
      }

      console.log("Gerando legendas...");
      const srt = generateSRT(script, duration);
      fs.writeFileSync(srtFile, srt);

      console.log("Criando vídeo...");
      
      const timePerImage = duration / images.length;
      let imageInputs = "";
      for (let i = 0; i < images.length; i++) {
        imageInputs += `-loop 1 -t ${timePerImage} -i "img${i}.jpg" `;
      }

      // Monta filter_complex com fade entre imagens
      let filterParts = [];
      for (let i = 0; i < images.length; i++) {
        filterParts.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1920:1080[v${i}]`);
      }
      
      let concat = "";
      for (let i = 0; i < images.length; i++) concat += `[v${i}]`;
      concat += `concat=n=${images.length}:v=1:a=0[vout]`;
      
      filterParts.push(concat);
      const filterComplex = filterParts.join(";");

      const ffmpegCmd = 
        `ffmpeg -y ${imageInputs}` +
        `-i "${audioFile}" ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[vout]" -map ${images.length}:a ` +
        `-c:v libx264 -preset ultrafast -crf 28 ` +
        `-c:a aac ` +
        `-pix_fmt yuv420p -shortest ` +
        `"${videoName}"`;

      execSync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 50 });

      if (!fs.existsSync(videoName)) throw new Error("Vídeo não criado");

      jobs[jobId].status = "done";
      jobs[jobId].video_url = "https://" + host + "/" + videoName;
      jobs[jobId].srt_url = "https://" + host + "/" + srtFile;
      
      console.log("Vídeo pronto!");

    } catch (err) {
      jobs[jobId].status = "error";
      jobs[jobId].error = err.message;
      console.log("Erro:", err.message);
    }
  });
});

app.get("/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ success: false, error: "job not found" });
  res.json({ success: true, status: job.status, video_url: job.video_url, srt_url: job.srt_url, error: job.error });
});

app.get("/:file", (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "file not found" });
  const stat = fs.statSync(filePath);
  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Content-Type", 
    ext === ".mp4" ? "video/mp4" : 
    ext === ".srt" ? "text/plain" : 
    "audio/mpeg"
  );
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(filePath).pipe(res);
});

setInterval(() => {
  try {
    const files = fs.readdirSync(__dirname);
    const now = Date.now();
    files.forEach(file => {
      if (file.startsWith("audio_") || file.startsWith("audio_dl_") || 
          file.startsWith("video_") || file.startsWith("img") || file.endsWith(".srt")) {
        try {
          const full = path.join(__dirname, file);
          if (now - fs.statSync(full).mtimeMs > 30 * 60 * 1000) {
            fs.unlinkSync(full);
          }
        } catch (e) {}
      }
    });
  } catch (e) {}
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("ViralFlowAI rodando na porta " + PORT);
});
