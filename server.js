const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};
const PIXABAY_KEY = "56312154-50a7e60c89bbca8e2ec16e16f";
// CHAVE DO PEXELS DO USUÁRIO INTEGRADA
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

// BUSCA NO PEXELS (PRIORIDADE 1)
function fetchPexelsImages(query, count) {
  return new Promise((resolve, reject) => {
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
            const images = json.photos.map(p => p.src.large2x || p.src.large);
            resolve(images);
          } else {
            resolve([]);
          }
        } catch (e) {
          resolve([]);
        }
      });
    }).on("error", () => resolve([]));
  });
}

// BUSCA NO PIXABAY (FALLBACK)
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
    const parsed = parseFloat(output.trim());
    return isNaN(parsed) || parsed <= 0 ? 15 : parsed;
  } catch (e) {
    return 15;
  }
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
  let audioUrl = req.body.audioUrl;
  const script = req.body.script || "";
  const topic = req.body.topic || "nature";
  const imageCount = Math.max(6, req.body.imageCount || 8);

  audioUrl = String(audioUrl).replace(/^[="\s]+|["'\s]+$/g, '').trim();

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

      console.log("URL do áudio:");
      console.log(audioUrl);

      if (audioUrl.includes(host) || audioUrl.includes("viralflowai-edge-tts")) {
        const originalFilename = audioUrl.split("/").pop();
        const localPath = path.join(__dirname, originalFilename);
        if (fs.existsSync(localPath)) {
          fs.copyFileSync(localPath, path.join(__dirname, audioFile));
        } else {
          throw new Error("Áudio não encontrado no disco local.");
        }
      } else {
        execSync(`curl -L --fail --max-time 30 "${audioUrl}" -o "${audioFile}"`);
      }
      
      console.log("Download do áudio concluído.");

      const audioStats = fs.statSync(audioFile);
      if (audioStats.size < 5000) throw new Error("Áudio inválido");
      
      const duration = getAudioDuration(audioFile);

      console.log(`Buscando imagens para o tema: ${topic}...`);
      let images = [];
      
      try {
        images = await fetchPexelsImages(topic, imageCount);
        console.log(`Pexels retornou ${images.length} imagens.`);
      } catch (e) {
        console.log("Falha na busca do Pexels, recorrendo ao Pixabay...");
      }

      if (images.length === 0) {
        images = await fetchPixabayImages(topic, imageCount);
        console.log(`Pixabay de emergência retornou ${images.length} imagens.`);
      }

      if (images.length < 3) throw new Error("Não foram encontradas imagens suficientes.");
      
      for (let i = 0; i < images.length; i++) {
        execSync(`curl -L --fail --max-time 30 "${images[i]}" -o "img${i}.jpg"`);
        if (!fs.existsSync(`img${i}.jpg`)) throw new Error("Falha ao baixar imagem de índice " + i);
      }

      const srtContent = generateSRT(script, duration);
      fs.writeFileSync(srtFile, srtContent);

      console.log("Iniciando a renderização avançada com FFmpeg...");
      
      const transitionDuration = 1.0; 
      const timePerImage = (duration / images.length) + transitionDuration;

      let imageInputs = "";
      let filterComplexParts = [];
      
      for (let i = 0; i < images.length; i++) {
        imageInputs += `-loop 1 -r 25 -t ${timePerImage} -i "img${i}.jpg" `;
        
        filterComplexParts.push(
          `[${i}:v]scale=1440:2560,zoompan=z='min(zoom+0
