const express = require("express");

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

  res.json({
    success: true,
    message: "TTS endpoint funcionando",
    text,
    voice: voice || "pt-BR-AntonioNeural"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
