const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI Edge TTS",
    status: "online"
  });
});

app.post("/tts", async (req, res) => {
  const { text, voice } = req.body;

  if (!text) {
    return res.status(400).json({ error: "text required" });
  }

  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = path.join(__dirname, fileName);

  const cmd = `edge-tts --voice "${voice || "pt-BR-AntonioNeural"}" --text "${text}" --write-media "${filePath}"`;

  exec(cmd, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

    const url = `${req.protocol}://${req.get("host")}/${fileName}`;

    res.json({
      success: true,
      audio_url: url
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
