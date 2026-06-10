const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");

const app = express();
app.use(express.json({ limit: "50mb" }));

const jobs = {};

const voices = {
  "pt-f": "pt-BR-FranciscaNeural",
  "pt-m": "pt-BR-AntonioNeural",
  "en-f": "en-US-JennyNeural",
  "en-m": "en-US-GuyNeural",
  "es-f": "es-ES-ElviraNeural",
  "es-m": "es-ES-AlvaroNeural",
  "pt": "pt-BR-FranciscaNeural",
  "en": "en-US-JennyNeural",
  "es": "es-ES-ElviraNeural"
};

function cleanUrl(url) {
  if (!url) return "";
  return String(url)
    .replace(/^=/, "")
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

function cleanOldFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
      if (
        file.startsWith("audio_") ||
        file.startsWith("audio_dl_") ||
        file.startsWith("video_") ||
        file.startsWith("img")
      ) {
        try {
          fs.unlinkSync(path.join(__dirname, file));
        } catch (e) {}
      }
    });
    console.log("Cache antigo removido.");
  } catch (e) {
    console.log(e.message);
  }
}

cleanOldFiles();

app.get("/", function(req, res) {
  res.json({
    success: true,
    service: "ViralFlowAI Edge TTS",
    status: "online",
    voices: Object.keys(voices)
  });
});

app.get("/voices", function(req, res) {
  res.json({ success: true, voices });
});

app.post("/tts", function(req, res) {
  var text = req.body.text;
  var lang = req.body.lang || "pt-f";
  var rate = req.body.rate || "+0%";
  var pitch = req.body.pitch || "+0Hz";

  if (!text || String(text).trim() === "") {
    return res.status(400).json({
      success: false,
      error: "text required"
    });
  }

  var voice = voices[lang] || voices["pt-f"];
  var filename =
    "audio_" +
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 8) +
    ".mp3";

  var safeText = String(text)
    .replace(/"/g, '\\"')
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");

  var command =
    'edge-tts ' +
    '--voice "' + voice + '" ' +
    '--rate="' + rate + '" ' +
    '--pitch="' + pitch + '" ' +
    '--text "' + safeText + '" ' +
    '--write-media "' + filename + '"';

  console.log("Gerando audio...");

  exec(command, function(error, stdout, stderr) {
    if (error) {
      console.log(stderr);
      return res.status(500).json({
        success: false,
        error: "Erro ao gerar audio",
        details: stderr
      });
    }
    try {
      if (!fs.existsSync(filename)) {
        throw new Error("Arquivo nao criado");
      }
      var stats = fs.statSync(filename);
      if (stats.size < 5000) {
        throw new Error("Audio invalido: " + stats.size + " bytes");
      }
      res.json({
        success: true,
        audio_url: "https://" + req.get("host") + "/" + filename,
        voice_used: voice,
        lang: lang
      });
    } catch (err) {
      try {
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      } catch (e) {}
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });
});

app.post("/create-video", function(req, res) {
  var images = req.body.images || [];
  var audioUrl = cleanUrl(req.body.audioUrl);

  images = images.map(function(img) {
    return cleanUrl(img);
  });

  if (!audioUrl) {
    return res.status(400).json({
      success: false,
      error: "audioUrl required"
    });
  }

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({
      success: false,
      error: "images required"
    });
  }

  var jobId =
    "job_" +
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 7);

  jobs[jobId] = {
    status: "processing",
    video_url: null,
    error: null
  };

  res.json({
    success: true,
    job_id: jobId,
    status: "processing"
  });

  setImmediate(function() {
    var audioFile = "audio_dl_" + Date.now() + ".mp3";
    var videoName = "video_" + Date.now() + ".mp4";
    var host = req.get("host");

    try {
      console.log("Baixando audio...");
      execSync('curl -L --fail --max-time 60 "' + audioUrl + '" -o "' + audioFile + '"');

      if (!fs.existsSync(audioFile)) {
        throw new Error("Audio nao encontrado");
      }

      var audioStats = fs.statSync(audioFile);
      if (audioStats.size < 5000) {
        throw new Error(
          "Audio invalido - tamanho muito pequeno: " + audioStats.size + " bytes"
        );
      }

      console.log("Baixando imagens...");
      for (var i = 0; i < images.length; i++) {
        execSync('curl -L --fail --max-time 30 "' + images[i] + '" -o "img' + i + '.jpg"');
        if (!fs.existsSync("img" + i + ".jpg")) {
          throw new Error("Falha imagem " + i);
        }
        var imgStats = fs.statSync("img" + i + ".jpg");
        if (imgStats.size < 10000) {
          throw new Error("Imagem invalida " + i);
        }
      }

      console.log("Criando video...");
      execSync(
        'ffmpeg -y ' +
        '-framerate 1/8 ' +
        '-i img%d.jpg ' +
        '-i "' + audioFile + '" ' +
        '-c:v libx264 ' +
        '-c:a aac ' +
        '-pix_fmt yuv420p ' +
        '-shortest "' + videoName + '"'
      );

      jobs[jobId].status = "done";
      jobs[jobId].video_url = "https://" + host + "/" + videoName;
      console.log("Video pronto.");

    } catch (err) {
      jobs[jobId].status = "error";
      jobs[jobId].error = err.message;
      console.log(err.message);
    }
  });
});

app.get("/status/:jobId", function(req, res) {
  var job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({
      success: false,
      error: "job not found"
    });
  }
  res.json({
    success: true,
    status: job.status,
    video_url: job.video_url,
    error: job.error
  });
});

// Rota de arquivos com stream para evitar timeout do Railway
app.get("/:file", function(req, res) {
  var file = path.basename(req.params.file);
  var filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: "file not found"
    });
  }

  var stat = fs.statSync(filePath);

  res.setHeader("Content-Length", stat.size);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  var stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

function autoClean() {
  try {
    const files = fs.readdirSync(__dirname);
    const now = Date.now();

    files.forEach(function(file) {
      if (
        file.startsWith("audio_") ||
        file.startsWith("audio_dl_") ||
        file.startsWith("video_") ||
        file.startsWith("img")
      ) {
        try {
          const full = path.join(__dirname, file);
          const stats = fs.statSync(full);
          const age = now - stats.mtimeMs;
          if (age > 30 * 60 * 1000) {
            fs.unlinkSync(full);
            console.log("Removido: " + file);
          }
        } catch (e) {}
      }
    });
  } catch (e) {
    console.log(e.message);
  }
}

setInterval(autoClean, 5 * 60 * 1000);

var PORT = process.env.PORT || 3000;

app.listen(PORT, function() {
  console.log("ViralFlowAI Edge TTS rodando na porta " + PORT);
  autoClean();
});
