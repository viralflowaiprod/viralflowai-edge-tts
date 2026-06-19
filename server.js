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

  "pt": "pt-BR-FranciscaNeural",
  "en": "en-US-JennyNeural",
  "es": "es-ES-ElviraNeural"
};

function cleanOldFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
      if (
        file.startsWith("audio_") ||
        file.startsWith("audio_dl_") ||
        file.startsWith("video_") ||
        file.startsWith("img") ||
        file.endsWith(".srt")
      ) {
        try {
          fs.unlinkSync(path.join(__dirname, file));
        } catch (e) {}
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
  const safeText = String(text)
    .replace(/"/g, '\\"')
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");

  const cmd = `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${filename}"`;

  exec(cmd, (error) => {
    if (error) {
      return res.status(500).json({ success: false, error: "Erro ao gerar áudio" });
    }

    try {
      if (!fs.existsSync(filename)) throw new Error("Arquivo não criado");

      res.json({
        success: true,
        audio_url: `http://163.176.247.97:3000/${filename}`
      });

    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

/* =========================
   CREATE VIDEO (placeholder)
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

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "file not found" });
  }

  fs.createReadStream(filePath).pipe(res);
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 SERVER RODANDO NA PORTA ${PORT}`);
});
