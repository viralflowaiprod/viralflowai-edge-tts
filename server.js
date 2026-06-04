const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// =======================
// STATUS
// =======================
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI TTS",
    status: "online"
  });
});

// =======================
// TTS (ELEVENLABS ONLY - FUNCIONANDO)
// =======================
app.post("/tts", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "text required"
    });
  }

  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = path.join(__dirname, fileName);

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVEN_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2"
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({
        success: false,
        error: "ElevenLabs failed",
        details: errorText
      });
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    const audioUrl = `${req.protocol}://${req.get("host")}/${fileName}`;

    return res.json({
      success: true,
      audio_url: audioUrl
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// =======================
// SERVIR MP3
// =======================
app.get("/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);
  res.sendFile(filePath);
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("TTS running on port " + PORT);
});
