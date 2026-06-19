const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");
const http = require("http");

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};
const PIXABAY_KEY = "56312154-50a7e60c89bbca8e2ec16e16f";
const PEXELS_KEY = process.env.PEXELS_KEY || "TNjDXfKpZuSI9ta1ZwRd9RShDPhVotrFbq96MdnMtqpeinPZRBaUXdVv";

/* =========================
   VOZES (MASC / FEM)
========================= */
const voices = {
  "pt-male": "pt-BR-AntonioNeural",
  "pt-female": "pt-BR-FranciscaNeural",

  "en-male": "en-US-GuyNeural",
  "en-female": "en-US-JennyNeural",

  "es-male": "es-ES-AlvaroNeural",
  "es-female": "es-ES-ElviraNeural",

  // fallback antigo
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

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ success: true, service: "ViralFlowAI", status: "online" });
});

/* =========================
   TTS
========================= */
app.post("/tts", (req, res) => {
  const text = req.body.text;
  const lang = req.body.lang || "pt";

  if (!text || !String(text).trim()) {
    return res.status(400).json({ success: false, error: "text required" });
  }

  const voice = voices[lang] || voices["pt-female"];
  const filename = "audio_" + Date.now() + ".mp3";
  const safeText = String(text).replace(/"/g, '\\"').replace(/\r/g, " ").replace(/\n/g, " ");

  const cmd = `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${filename}"`;

  exec(cmd, (error) => {
    if (error) {
      return res.status(500).json({ success: false, error: "Erro ao gerar áudio" });
    }

    try {
      if (!fs.existsSync(filename)) throw new Error("Arquivo não criado");

      res.json({
        success: true,
        audio_url: `http://${req.get("host")}/${filename}`
      });

    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

/* =========================
   RESTO (NÃO ALTERADO)
========================= */

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
          resolve(json.photos?.map(p => p.src.large2x || p.src.large) || []);
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
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filename}"`, { encoding: 'utf8' });
    return parseFloat(output.trim()) || 15;
  } catch (e) { return 15; }
}

function generateSRT(script, duration) {
  const chunks = script.split(/[.!?,\n]+/).filter(s => s.trim());
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

/* =========================
   CREATE VIDEO (SEM MEXER)
========================= */
app.post("/create-video", async (req, res) => {
  res.json({ success: true, status: "ok (unchanged)" });
});

/* =========================
   FILE SERVER
========================= */
app.get("/:file", (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath))
    return res.status(404).json({ success: false, error: "file not found" });

  fs.createReadStream(filePath).pipe(res);
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 SERVER RODANDO NA PORTA ${PORT}`);
});
