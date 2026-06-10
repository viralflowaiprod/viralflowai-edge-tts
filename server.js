const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const { promisify } = require("util");
const { v4: uuid } = require("uuid");

const execAsync = promisify(exec);

const app = express();

app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const jobs = {};

const BASE_DIR = __dirname;
const JOBS_DIR = path.join(BASE_DIR, "jobs");

if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR);
}

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

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "ViralFlowAI",
        status: "online"
    });
});

app.get("/voices", (req, res) => {
    res.json({
        success: true,
        voices
    });
});

app.post("/tts", async (req, res) => {

    try {

        const text = req.body.text;

        if (!text || text.trim().length < 5) {
            return res.status(400).json({
                success: false,
                error: "text required"
            });
        }

        const lang = req.body.lang || "pt-f";
        const rate = req.body.rate || "+0%";
        const pitch = req.body.pitch || "+0Hz";

        const voice = voices[lang] || voices["pt-f"];

        const filename = `audio_${Date.now()}_${uuid()}.mp3`;

        const filepath = path.join(BASE_DIR, filename);

        const safeText = text
            .replace(/"/g, '\\"')
            .replace(/\n/g, " ");

        const cmd =
            `edge-tts ` +
            `--voice "${voice}" ` +
            `--rate="${rate}" ` +
            `--pitch="${pitch}" ` +
            `--text "${safeText}" ` +
            `--write-media "${filepath}"`;

        await execAsync(cmd);

        if (!fs.existsSync(filepath)) {
            throw new Error("audio not generated");
        }

        const stats = fs.statSync(filepath);

        if (stats.size < 5000) {
            throw new Error("corrupted audio");
        }

        res.json({
            success: true,
            audio_url: `https://${req.get("host")}/${filename}`
        });

    } catch (e) {

        console.log(e);

        res.status(500).json({
            success: false,
            error: e.message
        });

    }

});

app.post("/create-video", async (req, res) => {

    const audioUrl = req.body.audioUrl;
    const images = req.body.images;

    if (!audioUrl) {
        return res.status(400).json({
            success: false,
            error: "audioUrl required"
        });
    }

    if (!Array.isArray(images)) {
        return res.status(400).json({
            success: false,
            error: "images must be array"
        });
    }

    if (images.length === 0) {
        return res.status(400).json({
            success: false,
            error: "images empty"
        });
    }

    const jobId = uuid();

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

    try {

        const workDir = path.join(JOBS_DIR, jobId);

        fs.mkdirSync(workDir);

        const audioFile = path.join(workDir, "audio.mp3");

        console.log("Downloading audio...");

        const audioResponse = await axios({
            url: audioUrl,
            method: "GET",
            responseType: "stream"
        });

        await new Promise((resolve, reject) => {

            const stream =
                fs.createWriteStream(audioFile);

            audioResponse.data.pipe(stream);

            stream.on("finish", resolve);
            stream.on("error", reject);

        });

        const audioStats = fs.statSync(audioFile);

        if (audioStats.size < 5000) {
            throw new Error("invalid audio");
        }

        console.log("Downloading images...");

        for (let i = 0; i < images.length; i++) {

            const img =
                path.join(workDir, `img${i}.jpg`);

            const response = await axios({
                url: images[i],
                method: "GET",
                responseType: "stream"
            });

            await new Promise((resolve, reject) => {

                const stream =
                    fs.createWriteStream(img);

                response.data.pipe(stream);

                stream.on("finish", resolve);
                stream.on("error", reject);

            });

        }

        let txt = "";

        for (let i = 0; i < images.length; i++) {

            txt += `file 'img${i}.jpg'\n`;
            txt += `duration 4\n`;

        }

        txt += `file 'img${images.length - 1}.jpg'\n`;

        fs.writeFileSync(
            path.join(workDir, "images.txt"),
            txt
        );

        console.log("Creating video...");

        const output =
            path.join(workDir, "video.mp4");

        const ffmpeg =

            `cd "${workDir}" && ` +

            `ffmpeg -y ` +

            `-f concat ` +

            `-safe 0 ` +

            `-i images.txt ` +

            `-i audio.mp3 ` +

            `-vf "scale=1080:1920,format=yuv420p" ` +

            `-c:v libx264 ` +

            `-c:a aac ` +

            `-shortest ` +

            `video.mp4`;

        await execAsync(ffmpeg);

        if (!fs.existsSync(output)) {
            throw new Error("video not created");
        }

        jobs[jobId].status = "done";

        jobs[jobId].video_url =
            `https://${req.get("host")}/jobs/${jobId}/video.mp4`;

    } catch (e) {

        console.log(e);

        jobs[jobId].status = "error";
        jobs[jobId].error = e.message;

    }

});

app.get("/status/:jobId", (req, res) => {

    const job = jobs[req.params.jobId];

    if (!job) {
        return res.status(404).json({
            success: false,
            error: "job not found"
        });
    }

    res.json(job);

});

app.get("/jobs/:jobId/video.mp4", (req, res) => {

    const file =
        path.join(
            JOBS_DIR,
            req.params.jobId,
            "video.mp4"
        );

    if (!fs.existsSync(file)) {
        return res.status(404).json({
            success: false
        });
    }

    res.sendFile(file, {
        headers: {
            "Cache-Control": "no-cache"
        }
    });

});

app.get("/:file", (req, res) => {

    const file =
        path.join(BASE_DIR, req.params.file);

    if (!fs.existsSync(file)) {
        return res.status(404).json({
            success: false
        });
    }

    res.sendFile(file, {
        headers: {
            "Cache-Control": "no-cache"
        }
    });

});

app.listen(PORT, () => {
    console.log(
        "ViralFlowAI Server running on port " + PORT
    );
});
