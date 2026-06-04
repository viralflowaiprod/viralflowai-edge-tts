const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
app.use(express.json());

// STATUS
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI Hybrid TTS",
    status: "online"
  });
});

// =========================
// ELEVENLABS + PIPER FALLBACK
// =========================

async function elevenLabsTTS(text, filePath) {
  const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": process.env.ELEVEN_API_KEY || "demo"
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5
      }
    })
  });

  if (!response.ok) throw new Error("ElevenLabs failed");

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(buffer));
}

// fallback local (Piper via CLI)
function piperTTS(text, filePath) {
  return new Promise((resolve, reject) => {
    const safeText = text.replace(/"/g, "'");

    // OBS: aqui assume Piper instalado no servidor
    const cmd = `piper --text "${safeText}" --output_file "${filePath}"`;

    exec(cmd, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// =========================
// TTS ROUTE
// =========================

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
    // 1. tenta ElevenLabs
    await elevenLabsTTS(text, filePath);

  } catch (e) {
    try {
      // 2. fallback Piper
      await piperTTS(text, filePath);

    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Both TTS failed",
        details: err.message
      });
    }
  }

  const audioUrl = `${req.protocol}://${req.get("host")}/${fileName}`;

  res.json({
    success: true,
    audio_url: audioUrl
  });
});

// SERVIR MP3
app.get("/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);
  res.sendFile(filePath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("TTS Hybrid running on port " + PORT);
});
