const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();

app.use(express.json());

// =======================
// STATUS
// =======================
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI Edge TTS + Video Builder",
    status: "online"
  });
});

// =======================
// EDGE TTS
// =======================
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

        const audioUrl = `https://${req.get("host")}/${filename}`;

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

// =======================
// VIDEO BUILDER (NOVO)
// =======================
app.post("/create-video", async (req, res) => {
  const { images, audioUrl } = req.body;

  if (!images || !audioUrl || images.length === 0) {
    return res.status(400).json({
      success: false,
      error: "images and audioUrl required"
    });
  }

  const videoName = `video_${Date.now()}.mp4`;
  const audioFile = `audio_${Date.now()}.mp3`;

  try {
    // 1. baixar áudio
    exec(`curl -L "${audioUrl}" -o ${audioFile}`);

    // 2. baixar imagens
    images.forEach((img, i) => {
      exec(`curl -L "${img}" -o img${i}.jpg`);
    });

    // espera simples (MVP)
    setTimeout(() => {
      // 3. montar vídeo com FFmpeg
      const ffmpegCmd = `
        ffmpeg -y \
        -framerate 1/4 \
        -i img%d.jpg \
        -i ${audioFile} \
        -c:v libx264 \
        -c:a aac \
        -pix_fmt yuv420p \
        -shortest \
        ${videoName}
      `;

      exec(ffmpegCmd, (error) => {
        if (error) {
          return res.status(500).json({
            success: false,
            error: error.message
          });
        }

        const videoUrl = `https://${req.get("host")}/${videoName}`;

        return res.json({
          success: true,
          video_url: videoUrl
        });
      });

    }, 4000);

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// =======================
// SERVIR ARQUIVOS
// =======================
app.get("/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: "file not found"
    });
  }

  res.sendFile(filePath);
});

// =======================
// START
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
