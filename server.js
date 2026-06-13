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
  return String(url).replace(/^=/, "").replace(/^"+/, "").replace(/"+$/, "").trim();
}

function cleanOldFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
      if (file.startsWith("audio_") || file.startsWith("audio_dl_") ||
          file.startsWith("video_") || file.startsWith("img")) {
        try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) {}
      }
    });
    console.log("Cache antigo removido.");
  } catch (e) { console.log(e.message); }
}

cleanOldFiles();

app.get("/", function(req, res) {
  res.json({ success: true, service: "ViralFlowAI Edge TTS", status: "online" });
});

app.get("/voices", function(req, res) {
  res.json({ success: true, voices });
});

app.post("/tts", function(req, res) {
  var text = req.body.text;
  var lang = req.body.lang || "pt-f";
  var rate = req.body.rate || "-10%";
  var pitch = req.body.pitch || "-3Hz";

  if (!text || String(text).trim() === "") {
    return res.status(400).json({ success: false, error: "text required" });
  }

  var voice = voices[lang] || voices["pt-f"];
  var filename = "audio_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8) + ".mp3";
  var safeText = String(text).replace(/"/g, '\\"').replace(/\r/g, " ").replace(/\n/g, " ");

  var command =
    'edge-tts --voice "' + voice + '" ' +
    '--rate="' + rate + '" --pitch="' + pitch + '" ' +
    '--text "' + safeText + '" --write-media "' + filename + '"';

  console.log("Gerando audio...");

  exec(command, function(error, stdout, stderr) {
    if (error) {
      console.log(stderr);
      return res.status(500).json({ success: false, error: "Erro ao gerar audio" });
    }
    try {
      if (!fs.existsSync(filename)) throw new Error("Arquivo nao criado");
      var stats = fs.statSync(filename);
      if (stats.size < 5000) throw new Error("Audio invalido: " + stats.size + " bytes");
      res.json({
        success: true,
        audio_url: "https://" + req.get("host") + "/" + filename,
        voice_used: voice,
        lang: lang
      });
    } catch (err) {
      try { if (fs.existsSync(filename)) fs.unlinkSync(filename); } catch (e) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

app.post("/create-video", function(req, res) {
  var images = req.body.images || [];
  var audioUrl = cleanUrl(req.body.audioUrl);
  var captions = req.body.captions || [];

  images = images.map(function(img) { return cleanUrl(img); });

  if (!audioUrl) return res.status(400).json({ success: false, error: "audioUrl required" });
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ success: false, error: "images required" });

  var jobId = "job_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  jobs[jobId] = { status: "processing", video_url: null, error: null };

  res.json({ success: true, job_id: jobId, status: "processing" });

  setImmediate(function() {
    var audioFile = "audio_dl_" + Date.now() + ".mp3";
    var videoName = "video_" + Date.now() + ".mp4";
    var host = req.get("host");

    try {
      // Extrai nome do arquivo e lê DIRETO DO DISCO — sem curl, sem loopback
      var audioFileName = audioUrl.split("/").pop().split("?")[0];
      var audioFileDisk = path.join(__dirname, audioFileName);

      console.log("Procurando audio no disco:", audioFileDisk);

      if (fs.existsSync(audioFileDisk) && fs.statSync(audioFileDisk).size >= 5000) {
        console.log("Audio encontrado no disco! Copiando...");
        fs.copyFileSync(audioFileDisk, audioFile);
      } else {
        // Lista arquivos de audio disponiveis para debug
        var availableAudios = fs.readdirSync(__dirname).filter(f => f.startsWith("audio_") && f.endsWith(".mp3"));
        throw new Error("Audio nao encontrado no disco: " + audioFileName + ". Disponiveis: " + availableAudios.join(", "));
      }

      var audioStats = fs.statSync(audioFile);
      if (audioStats.size < 5000) throw new Error("Audio invalido: " + audioStats.size + " bytes");
      console.log("Audio OK:", audioStats.size, "bytes");

      // Calcula duracao por imagem — minimo 60 segundos
      var totalImages = images.length;
      var secPerImage = Math.max(12, Math.ceil(60 / totalImages));
      console.log("Segundos por imagem:", secPerImage, "| Total imagens:", totalImages);

      // Baixa imagens
      console.log("Baixando imagens...");
      for (var i = 0; i < images.length; i++) {
        execSync('curl -L --fail --max-time 30 "' + images[i] + '" -o "img' + i + '.jpg"');
        if (!fs.existsSync("img" + i + ".jpg")) throw new Error("Falha imagem " + i);
        if (fs.statSync("img" + i + ".jpg").size < 10000) throw new Error("Imagem invalida " + i);
      }

      console.log("Criando video com Ken Burns + legendas...");

      // Monta filtros para cada imagem com Ken Burns + legenda + fade
      var filterParts = [];
      for (var i = 0; i < totalImages; i++) {
        var caption = (captions[i] || "").toString()
          .replace(/'/g, "\u2019")
          .replace(/:/g, "\\:")
          .replace(/\[/g, "\\[")
          .replace(/\]/g, "\\]")
          .replace(/,/g, "\\,");

        var dur = secPerImage * 25; // frames (25fps)
        var kenBurns = "zoompan=z='min(zoom+0.0008,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + dur + ":s=1080x1920:fps=25";
        var fadeIn = "fade=t=in:st=0:d=0.5";
        var fadeOut = "fade=t=out:st=" + (secPerImage - 0.5) + ":d=0.5";

        var drawtext = "";
        if (caption) {
          drawtext = ",drawtext=" +
            "fontsize=50:" +
            "fontcolor=white:" +
            "bordercolor=black:" +
            "borderw=3:" +
            "x=(w-text_w)/2:" +
            "y=(h*0.80):" +
            "text='" + caption + "':" +
            "expansion=none";
        }

        filterParts.push("[" + i + ":v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920," + kenBurns + drawtext + "," + fadeIn + "," + fadeOut + "[v" + i + "]");
      }

      // Concatena
      var concatInputs = "";
      for (var i = 0; i < totalImages; i++) concatInputs += "[v" + i + "]";
      var filterComplex = filterParts.join("; ") + "; " + concatInputs + "concat=n=" + totalImages + ":v=1:a=0[vout]";

      // Monta inputs
      var imageInputs = "";
      for (var i = 0; i < totalImages; i++) {
        imageInputs += '-loop 1 -t ' + secPerImage + ' -i "img' + i + '.jpg" ';
      }

      var ffmpegCmd =
        'ffmpeg -y ' + imageInputs +
        '-i "' + audioFile + '" ' +
        '-filter_complex "' + filterComplex + '" ' +
        '-map "[vout]" -map ' + totalImages + ':a ' +
        '-c:v libx264 -preset fast -crf 20 ' +
        '-c:a aac -b:a 192k ' +
        '-pix_fmt yuv420p -shortest ' +
        '"' + videoName + '"';

      execSync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 100 });

      if (!fs.existsSync(videoName)) throw new Error("Video nao criado");

      jobs[jobId].status = "done";
      jobs[jobId].video_url = "https://" + host + "/" + videoName;
      console.log("Video pronto:", videoName);

    } catch (err) {
      jobs[jobId].status = "error";
      jobs[jobId].error = err.message;
      console.log("Erro:", err.message);
    }
  });
});

app.get("/status/:jobId", function(req, res) {
  var job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ success: false, error: "job not found" });
  res.json({ success: true, status: job.status, video_url: job.video_url, error: job.error });
});

app.get("/:file", function(req, res) {
  var file = path.basename(req.params.file);
  var filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "file not found" });
  var stat = fs.statSync(filePath);
  var ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Content-Type", ext === ".mp4" ? "video/mp4" : "audio/mpeg");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  fs.createReadStream(filePath).pipe(res);
});

function autoClean() {
  try {
    const files = fs.readdirSync(__dirname);
    const now = Date.now();
    files.forEach(function(file) {
      if (file.startsWith("audio_") || file.startsWith("audio_dl_") ||
          file.startsWith("video_") || file.startsWith("img")) {
        try {
          const full = path.join(__dirname, file);
          if (now - fs.statSync(full).mtimeMs > 30 * 60 * 1000) {
            fs.unlinkSync(full);
            console.log("Removido: " + file);
          }
        } catch (e) {}
      }
    });
  } catch (e) { console.log(e.message); }
}

setInterval(autoClean, 5 * 60 * 1000);

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("ViralFlowAI rodando na porta " + PORT);
  autoClean();
});
