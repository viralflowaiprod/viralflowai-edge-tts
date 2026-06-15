const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");
const http = require("http"); // Adicionado para conversar com o n8n via HTTP

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};
const PIXABAY_KEY = "56312154-50a7e60c89bbca8e2ec16e16f";
const PEXELS_KEY = process.env.PEXELS_KEY || "TNjDXfKpZuSI9ta1ZwRd9RShDPhVotrFbq96MdnMtqpeinPZRBaUXdVv"; 

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

  exec(cmd, (error) => {
    if (error) {
      return res.status(500).json({ success: false, error: "Erro ao gerar áudio" });
    }
    try {
      if (!fs.existsSync(filename)) throw new Error("Arquivo não criado");
      res.json({ success: true, audio_url: "https://" + req.get("host") + "/" + filename });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

function fetchPexelsImages(query, count) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.pexels.com',
      path: `/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=portrait`,
      headers: { 'Authorization': PEXELS_KEY }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.photos && json.photos.length > 0) {
            resolve(json.photos.map(p => p.src.large2x || p.src.large));
          } else { resolve([]); }
        } catch (e) { resolve([]); }
      });
    }).on("error", () => resolve([]));
  });
}

function fetchPixabayImages(query, count) {
  return new Promise((resolve) => {
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${count}&order=popular`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.hits.map(hit => hit.largeImageURL).slice(0, count));
        } catch (e) { resolve([]); }
      });
    }).on("error", () => resolve([]));
  });
}

function getAudioDuration(filename) {
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:noprint_sections=1 "${filename}"`, { encoding: 'utf8' });
    return parseFloat(output.trim()) || 15;
  } catch (e) { return 15; }
}

function generateSRT(script, duration) {
  const chunks = script.split(/[.!?,\n]+/).filter(s => s.trim());
  if (chunks.length === 0) return "";
  let srt = "";
  const timePerChunk = duration / chunks.length;
  chunks.forEach((chunk, i) => {
    const start = i * timePerChunk;
    const end = (i + 1) * timePerChunk;
    const formatTime = (sec) => {
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    srt += `${i + 1}\n${formatTime(start)} --> ${formatTime(end)}\n${chunk.trim()}\n\n`;
  });
  return srt;
}

// ROTA CHAMADA PELO LOVABLE
app.post("/create-video", async (req, res) => {
  let audioUrl = req.body.audioUrl || "";
  const script = req.body.script || "";
  const topic = req.body.topic || "nature";
  const imageCount = Math.max(6, req.body.imageCount || 8);

  audioUrl = String(audioUrl).replace(/^[="\s]+|["'\s]+$/g, '').trim();

  const jobId = "job_" + Date.now();
  jobs[jobId] = { status: "processing", video_url: null, error: null };

  // Responde ao Lovable imediatamente para ele não travar
  res.json({ success: true, job_id: jobId, status: "processing" });

  // 🚀 PONTE ATUALIZADA: Repassa os dados para a URL de testes do seu n8n real
  setImmediate(() => {
    const n8nPayload = JSON.stringify({
      job_id: jobId,
      audioUrl: audioUrl,
      script: script,
      topic: topic,
      imageCount: imageCount,
      origin: "lovable_bridge"
    });

    const n8nOptions = {
      hostname: "163.176.60.170", // Seu IP público do n8n
      port: 5678,
      path: "/webhook-test/viralflow", // Rota de TESTE ativa no seu painel
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(n8nPayload)
      }
    };

    const reqN8n = http.request(n8nOptions, (resN8n) => {
      console.log(`Encaminhado para o n8n teste. Status: ${resN8n.statusCode}`);
    });

    reqN8n.on("error", (e) => {
      console.error(`Erro ao espelhar para o n8n: ${e.message}`);
    });

    reqN8n.write(n8nPayload);
    reqN8n.end();
  });

  // Renderiza também o vídeo em background localmente
  setImmediate(async () => {
    try {
      const audioFile = "audio_dl_" + Date.now() + ".mp3";
      const videoName = "video_" + Date.now() + ".mp4";
      const srtFile = "subs_" + Date.now() + ".srt";
      const host = req.get("host");

      if (audioUrl.includes(host)) {
        const localPath = path.join(__dirname, audioUrl.split("/").pop());
        if (fs.existsSync(localPath)) fs.copyFileSync(localPath, path.join(__dirname, audioFile));
        else throw new Error("Áudio local não encontrado");
      } else {
        execSync(`curl -L --fail --max-time 30 "${audioUrl}" -o "${audioFile}"`);
      }

      const duration = getAudioDuration(audioFile);
      let images = await fetchPexelsImages(topic, imageCount);
      if (images.length === 0) images = await fetchPixabayImages(topic, imageCount);
      if (images.length < 3) throw new Error("Imagens insuficientes");

      for (let i = 0; i < images.length; i++) {
        execSync(`curl -L --fail --max-time 30 "${images[i]}" -o "img${i}.jpg"`);
      }

      fs.writeFileSync(srtFile, generateSRT(script, duration));

      const timePerImage = (duration / images.length) + 1.0;
      let imageInputs = "";
      let filterComplexParts = [];

      for (let i = 0; i < images.length; i++) {
        imageInputs += `-loop 1 -r 25 -t ${timePerImage} -i "img${i}.jpg" `;
        filterComplexParts.push(`[${i}:v]scale=1440:2560,zoompan=z='min(zoom+0.0010,1.15)':d=${Math.ceil(timePerImage * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920[v${i}]`);
      }

      let currentOutput = "v0";
      let offset = duration / images.length;
      for (let i = 1; i < images.length; i++) {
        const nextOutput = `faded${i}`;
        filterComplexParts.push(`[currentOutput][v${i}]xfade=transition=fade:duration=1.0:offset=${offset.toFixed(2)}[${nextOutput}]`.replace("currentOutput", currentOutput));
        currentOutput = nextOutput;
        offset += (duration / images.length);
      }

      filterComplexParts.push(`[${currentOutput}]subtitles=${srtFile}:force_style='Alignment=2,FontSize=13,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,MarginV=180'[vout]`);
      
      execSync(`ffmpeg -y ${imageInputs}-i "${audioFile}" -filter_complex "${filterComplexParts.join("; ")}" -map "[vout]" -map ${images.length}:a -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -pix_fmt yuv420p -shortest "${videoName}"`, { maxBuffer: 1024 * 1024 * 60 });

      jobs[jobId].status = "done";
      jobs[jobId].video_url = "https://" + host + "/" + videoName;
      jobs[jobId].srt_url = "https://" + host + "/" + srtFile;
    } catch (err) {
      jobs[jobId].status = "error";
      jobs[jobId].error = err.message;
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
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(filePath).pipe(res);
});

setInterval(() => {
  try {
    const files = fs.readdirSync(__dirname);
    const now = Date.now();
    files.forEach(file => {
      if (file.startsWith("audio_") || file.startsWith("audio_dl_") || file.startsWith("video_") || file.startsWith("img") || file.endsWith(".srt")) {
        if (now - fs.statSync(path.join(__dirname, file)).mtimeMs > 30 * 60 * 1000) fs.unlinkSync(path.join(__dirname, file));
      }
    });
  } catch (e) {}
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log("Servidor de pontes rodando na porta " + PORT); });
