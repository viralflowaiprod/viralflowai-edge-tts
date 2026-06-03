const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// STATUS
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI Edge TTS",
    status: "online"
  });
});

// TTS
app.post("/tts", (req, res) => {
  const { text, voice } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "text required"
    });
  }

  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = path.join(__dirname, fileName);

  const safeText = text.replace(/"/g, "'");

  const cmd = `npx edge-tts --voice "${voice || "pt-BR-AntonioNeural"}" --text "${safeText}" --write-media "${filePath}"`;

  exec(cmd, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

    const audioUrl = `${req.protocol}://${req.get("host")}/${fileName}`;

    res.json({
      success: true,
      audio_url: audioUrl
    });
  });
});

// SERVIR MP3
app.get("/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);
  res.sendFile(filePath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});

// force deploy update 2026-06-03
