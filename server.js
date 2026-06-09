const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const app = express();
app.use(express.json());
const jobs = {};

const voices = {
  "pt": "pt-BR-AntonioNeural",
  "en": "en-US-GuyNeural",
  "es": "es-MX-JorgeNeural"
};

app.get("/", function(req, res) {
  res.json({ success: true, service: "ViralFlowAI Edge TTS + Video Builder", status: "online" });
});

app.post("/tts", function(req, res) {
  var text = req.body.text;
  var lang = req.body.lang || "pt";
  if (!text) return res.status(400).json({ success: false, error: "text required" });
  var voice = voices[lang] || voices["pt"];
  var ts = Date.now();
  var wavFile = "audio_" + ts + ".wav";
  var mp3File = "audio_" + ts + ".mp3";
  exec("edge-tts --voice " + voice + " --text \"" + text + "\" --write-media " + wavFile + " && ffmpeg -y -i " + wavFile + " " + mp3File, function(error) {
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, audio_url: "https://" + req.get("host") + "/" + mp3File });
  });
});

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
  var rawAudio = "audio_raw_" + Date.now() + ".mp3";
  var audioFile = "audio_conv_" + Date.now() + ".mp3";
  var host = req.get("host");
  setImmediate(function() {
    try {
      console.log("Baixando audio...");
      execSync("curl -L \"" + audioUrl + "\" -o " + rawAudio);
      console.log("Convertendo audio...");
      execSync("ffmpeg -y -i " + rawAudio + " -acodec libmp3lame " + audioFile);
      console.log("Baixando imagens...");
      for (var i = 0; i < images.length; i++) {
        execSync("curl -L \"" + images[i] + "\" -o img" + i + ".jpg");
      }
      console.log("Gerando video...");
      execSync("ffmpeg -y -framerate 1/4 -i img%d.jpg -i " + audioFile + " -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest " + videoName);
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

app.get("/status/:jobId", function(req, res) {
  var job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ success: false, error: "job not found" });
  res.json({ success: true, status: job.status, video_url: job.video_url, error: job.error });
});

app.get("/:file", function(req, res) {
  var filePath = path.join(__dirname, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "file not found" });
  res.sendFile(filePath);
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Server running on " + PORT);
});
