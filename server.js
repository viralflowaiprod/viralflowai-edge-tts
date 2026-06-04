const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

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
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: "text required"
      });
    }

    const filename = `audio_${Date.now()}.mp3`;

    exec(
      `edge-tts --voice pt-BR-AntonioNeural --text "${text}" --write-media ${filename}`,
      (error) => {
        if (error) {
          return res.status(500).json({
            success: false,
            error: error.message
          });
        }

        const audioUrl =
          `${req.protocol}://${req.get("host")}/${filename}`;

        return res.json({
          success: true,
          audio_url: audioUrl
        });
      }
    );

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false
    });
  }

  res.sendFile(filePath);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
