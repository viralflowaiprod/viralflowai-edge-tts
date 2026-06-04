const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI TTS",
    status: "online"
  });
});

app.post("/tts", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "text required"
    });
  }

  return res.json({
    success: true,
    message: "Piper mode preparing",
    received_text: text
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("TTS running on port " + PORT);
});
