const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};
const PIXABAY_KEY = "56312154-50a7e60c89bbca8e2ec16e16f";
// CHAVE DO PEXELS ADICIONADA DIRETAMENTE
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
  const chunks =
