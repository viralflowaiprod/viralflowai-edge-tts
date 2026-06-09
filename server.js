const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync, exec } = require("child_process");

const app = express();
app.use(express.json());

const jobs = {};

// Vozes Edge TTS por idioma e gênero
const voices = {
  "pt-f": "pt-BR-FranciscaNeural",  // Português - Feminina
  "pt-m": "pt-BR-AntonioNeural",    // Português - Masculino
  "en-f": "en-US-JennyNeural",      // Inglês - Feminina
  "en-m": "en-US-GuyNeural",        // Inglês - Masculino
  "es-f": "es-ES-ElviraNeural",     // Espanhol - Feminina
  "es-m": "es-ES-AlvaroNeural",     // Espanhol - Masculino
  // Aliases simples (padrão feminino)
  "pt": "pt-BR-FranciscaNeural",
  "en": "en-US-JennyNeural",
  "es": "es-ES-ElviraNeural"
};

app.get("/", function(req, res) {
  res.json({
    success: true,
    service: "ViralFlowAI Edge TTS + Video Builder",
    status: "online",
    voices_available: Object.keys(voices)
  });
});

// Rota TTS usando Edge TTS
// Body: { text, lang, rate, pitch }
// lang options: "pt-f", "pt-m", "en-f", "en-m", "es-f", "es-m", "pt", "en", "es"
app.post("/tts", function(req, res) {
  var text = req.body.text;
  var lang = req.body.lang || "pt-f";
  var rate = req.body.rate || "+0%";
  var pitch = req.body.pitch || "+0Hz";

  if (!text) return res.status(400).json({ success: false, error: "text required" });

  var voice = voices[lang] || voices["pt-f"];
  var filename = "audio_" + Date.now() + ".mp3";
  var safeText = text.replace(/"/g, '\\"');

  var command = `edge-tts --voice "${voice}" --rate="${rate}" --pitch="${pitch}" --text "${safeText}" --write-media "${filename}"`;

  exec(command, function(error, stdout, stderr) {
    if (error) {
      console.error("Erro edge-tts:", stderr);
      return res.status(500).json({ success: false, error: "Erro ao gerar áudio.", details: stderr });
    }

    res.json({
      success: true,
      audio_url: "https://" + req.get("host") + "/" + filename,
      voice_used: voice,
      lang: lang
    });
  });
});

// Listar vozes disponíveis
app.get("/voices", function(req, res) {
  res.json({
    success: true,
    voices: {
      "pt-f": "pt-BR-FranciscaNeural (Português Feminina)",
      "pt-m": "pt-BR-AntonioNeural (Português Masculino)",
      "en-f": "en-US-JennyNeural (Inglês Feminina)",
      "en-m": "en-US-GuyNeural (Inglês Masculino)",
      "es-f": "es-ES-ElviraNeural (Espanhol Feminina)",
      "es-m": "es-ES-AlvaroNeural (Espanhol Masculino)"
    }
  });
});

// Criar vídeo
app.post("/create-video", function(req, res) {
  var images = req.body.images;
  var audioUrl = req.body.audioUrl;
  if (!images || !audioUrl || images.length === 0) {
    return res.status(400).json({ success: false, error: "images and audioUrl required" });
  }

  var jobId = "job_" + Date.now();
  jobs[jobId] = { status: "processing", video_url: null, error: null };
  res.json({ success: true, job_id: jobId, status: "processing" });

  var videoName = "video_" + Date.now() + ".mp4";
  var audioFile = "audio_dl_" + Date.now() + ".mp3";
  var host = req.get("host");

  setImmediate(function() {
    try {
      console.log("Baixando audio...");
      execSync(`curl -L "${audioUrl}" -o ${audioFile}`);
      var stats = fs.statSync(audioFile);
      if (stats.size < 1000) {
        throw new Error("Audio invalido - tamanho muito pequeno: " + stats.size + " bytes");
      }

      console.log("Baixando imagens...");
      for (var i = 0; i < images.length; i++) {
        execSync(`curl -L "${images[i]}" -o img${i}.jpg`);
      }

      console.log("Gerando video...");
      execSync(`ffmpeg -y -framerate 1/4 -i img%d.jpg -i ${audioFile} -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest ${videoName}`);

      jobs[jobId].status = "done";
      jobs[jobId].video_url = "https://" + host + "/" + videoName;
      console.log("Video pronto!");
    } catch (err) {
      jobs[jobId].status = "error";
      jobs[jobId].error = err.message;
      console.log("Erro: " + err.message);
    }
  });
});

// Status do job
app.get("/status/:jobId", function(req, res) {
  var job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ success: false, error: "job not found" });
  res.json({ success: true, status: job.status, video_url: job.video_url, error: job.error });
});

// Servir arquivos gerados
app.get("/:file", function(req, res) {
  var filePath = path.join(__dirname, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "file not found" });
  res.sendFile(filePath);
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("✅ ViralFlowAI Edge TTS rodando na porta " + PORT);
});
