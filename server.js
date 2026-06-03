const express = require("express");
const fs = require("fs");
const path = require("path");

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

// TTS SIMPLES (SEM EDGE-TTS)
app.post("/tts", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "text required"
    });
  }

  // simulação de áudio funcional (placeholder real)
  const fileName = `audio_${Date.now()}.txt`;
  const filePath = path.join(__dirname, fileName);

  fs.writeFileSync(filePath, text);

  const audioUrl = `${req.protocol}://${req.get("host")}/${fileName}`;

  return res.json({
    success: true,
    audio_url: audioUrl,
    note: "TTS placeholder ativo (pronto para integrar Piper ou ElevenLabs)"
  });
});

// servir arquivo
app.get("/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);
  res.sendFile(filePath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
