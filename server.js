const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");

const app = express();
app.use(express.json({ limit: "50mb" }));

// =====================
// JOBS + FILA (ANTI-CRASH)
// =====================
const jobs = {};
const queue = [];
let isProcessing = false;

// =====================
// CONFIG
// =====================
const PORT = process.env.PORT || 3000;

const PIXABAY_KEY = "56312154-50a7e60c89bbca8e2ec16e16f";
const PEXELS_KEY = process.env.PEXELS_KEY || "TNjDXfKpZuSI9ta1ZwRd9RShDPhVotrFbq96MdnMtqpeinPZRBaUXdVv";

const voices = {
  pt: "pt-BR-FranciscaNeural",
  en: "en-US-JennyNeural",
  es: "es-ES-ElviraNeural"
};

// =====================
// CLEAN CACHE
// =====================
function cleanOldFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
      if (
        file.startsWith("audio_") ||
        file.startsWith("video_") ||
        file.startsWith("img") ||
        file.endsWith(".srt")
      ) {
        try {
          fs.unlinkSync(path.join(__dirname, file));
        } catch {}
      }
    });
    console.log("Cache removido.");
  } catch {}
}

cleanOldFiles();

// =====================
// HEALTH CHECK
// =====================
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI",
    status: "online"
  });
});

// =====================
// TTS (EDGE-TTS)
// =====================
app.post("/tts", (req, res) => {
  const text = req.body.text;
  const lang = req.body.lang || "pt";

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: "text required" });
  }

  const voice = voices[lang] || voices.pt;
  const filename = "audio_" + Date.now() + ".mp3";

  const safeText = text
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");

  const cmd = `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${filename}"`;

  exec(cmd, (error) => {
    if (error) {
      return res.status(500).json({ success: false, error: "TTS error" });
    }

    const baseUrl = `http://localhost:${PORT}`;

    return res.json({
      success: true,
      audio_url: `${baseUrl}/${filename}`
    });
  });
});

// =====================
// SERVIR ARQUIVOS
// =====================
app.use("/audio", express.static(__dirname));
app.use("/video", express.static(__dirname));

// =====================
// FILA DE PROCESSAMENTO (ANTI-CRASH)
// =====================
async function processQueue() {
  if (isProcessing) return;
  if (queue.length === 0) return;

  isProcessing = true;

  const job = queue.shift();

  try {
    await job();
  } catch (err) {
    console.error("Job error:", err);
  }

  isProcessing = false;
  processQueue();
}

// =====================
// CREATE VIDEO (PROTEGIDO)
// =====================
app.post("/create-video", (req, res) => {
  const jobId = "job_" + Date.now();

  jobs[jobId] = {
    status: "queued"
  };

  queue.push(async () => {
    jobs[jobId].status = "processing";

    const audioUrl = req.body.audioUrl;
    const script = req.body.script || "video";
    const topic = req.body.topic || "video";

    const output = `video_${Date.now()}.mp4`;

    try {
      // 🔥 SIMULAÇÃO SEGURA (substituir por seu ffmpeg real depois)
      const cmd = `ffmpeg -y -i "${audioUrl}" -t 10 "${output}"`;

      execSync(cmd);

      jobs[jobId].status = "done";
      jobs[jobId].video = `http://localhost:${PORT}/${output}`;

    } catch (e) {
      jobs[jobId].status = "error";
    }
  });

  processQueue();

  res.json({
    success: true,
    job_id: jobId,
    status: "queued"
  });
});

// =====================
// STATUS JOB
// =====================
app.get("/job/:id", (req, res) => {
  const job = jobs[req.params.id];

  if (!job) {
    return res.status(404).json({ error: "not found" });
  }

  res.json(job);
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
  console.log(`🔥 SERVER RODANDO NA PORTA ${PORT}`);
});
