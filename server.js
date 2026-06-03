const express = require("express");

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

// TESTE TTS
app.post("/tts", (req, res) => {
  res.json({
    ok: true,
    text: req.body.text || "empty"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
