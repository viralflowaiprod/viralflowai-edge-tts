const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const https = require("https");

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};

// ========================
// VOICES CORRIGIDO
// ========================
const voices = {
  "pt-m": "pt-BR-AntonioNeural",
  "pt-f": "pt-BR-FranciscaNeural",
  "en-m": "en-US-GuyNeural",
  "en-f": "en-US-JennyNeural",
  "es-m": "es-ES-AlvaroNeural",
  "es-f": "es-ES-ElviraNeural"
};

// ========================
// CLEAN FILES
// ========================
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
        try { fs.unlinkSync(path.join(__dirname, file)); } catch {}
      }
    });
    console.log("Cache removido.");
  } catch {}
}

cleanOldFiles();

// ========================
// HEALTH CHECK
// ========================
app.get("/", (req, res) => {
  res.json({ success: true, service: "ViralFlowAI", status: "online" });
});

// ========================
// TTS (FIXADO)
// ========================
app.post("/tts", (req, res) => {
  const text = req.body.text;
  const lang = req.body.lang || "pt-f";

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: "text required" });
  }

  const voice = voices[lang] || voices["pt-f"];
  const filename = "audio_" + Date.now() + ".mp3";

  const safeText = String(text)
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");

  if (!safeText || safeText.trim().length < 3) {
    return res.status(400).json({ success: false, error: "text too short" });
  }

  const cmd = `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${filename}"`;

  exec(cmd, (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: "TTS error" });
    }

    const baseUrl = `http://${req.get("host")}`;

    res.json({
      success: true,
      audio_url: `${baseUrl}/${filename}`
    });
  });
});

// ========================
// CREATE VIDEO (mock estável por enquanto)
// ========================
app.post("/create-video", (req, res) => {
  const jobId = "job_" + Date.now();

  jobs[jobId] = {
    status: "processing"
  };

  res.json({
    success: true,
    job_id: jobId,
    status: "processing"
  });

  setTimeout(() => {
    jobs[jobId].status = "done";
    jobs[jobId].video_url = "processing.mp4";
  }, 5000);
});

// ========================
// STATUS
// ========================
app.get("/status/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "not found" });

  res.json(job);
});

// ========================
// FILE SERVER
// ========================
app.get("/:file", (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not found" });
  }

  fs.createReadStream(filePath).pipe(res);
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔥 SERVER REAL RODANDO NA PORTA ${PORT}`);
});
