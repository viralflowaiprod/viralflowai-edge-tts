const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");

const app = express();

app.use(express.json({ limit: "50mb" }));

const jobs = {};
const queue = [];
let isProcessing = false;

const PORT = process.env.PORT || 3000;


/*
  Vozes oficiais do SaaS
  Padrão: Português Brasil Masculino
*/

const voices = {

  "pt-BR-m": "pt-BR-AntonioNeural",
  "pt-BR-f": "pt-BR-FranciscaNeural",

  "en-US-m": "en-US-GuyNeural",
  "en-US-f": "en-US-JennyNeural",

  "es-ES-m": "es-ES-AlvaroNeural",
  "es-ES-f": "es-ES-ElviraNeural"

};


function cleanOldFiles() {

  try {

    const files = fs.readdirSync(__dirname);

    files.forEach(file => {

      if (
        file.startsWith("audio_") ||
        file.startsWith("video_")
      ) {

        try {
          fs.unlinkSync(
            path.join(__dirname,file)
          );
        } catch {}

      }

    });

  } catch {}

}


cleanOldFiles();



app.get("/", (req,res)=>{

  res.json({
    success:true,
    service:"ViralFlowAI",
    status:"online",
    defaultLanguage:"pt-BR",
    defaultVoice:"male"
  });

});



app.post("/tts",(req,res)=>{


  const text = req.body.text;


  // padrão brasileiro masculino
  const lang = req.body.lang || "pt-BR";

  const gender = req.body.voice || "male";


  if(!text || !text.trim()){

    return res.status(400).json({
      success:false,
      error:"text required"
    });

  }



  let selectedVoice;



  if(lang === "en-US"){

    selectedVoice =
      gender === "female"
      ? voices["en-US-f"]
      : voices["en-US-m"];

  }


  else if(lang === "es-ES"){

    selectedVoice =
      gender === "female"
      ? voices["es-ES-f"]
      : voices["es-ES-m"];

  }


  else {

    // tudo que não for reconhecido vira Brasil
    selectedVoice =
      gender === "female"
      ? voices["pt-BR-f"]
      : voices["pt-BR-m"];

  }



  const filename =
    "audio_" + Date.now() + ".mp3";


  const safeText =
    text
    .replace(/"/g,'\\"')
    .replace(/\n/g," ");



  const cmd =
    `edge-tts --voice "${selectedVoice}" --text "${safeText}" --write-media "${filename}"`;



  exec(cmd,(error)=>{


    if(error){

      console.error(error);

      return res.status(500).json({
        success:false,
        error:"TTS error"
      });

    }



    res.json({

      success:true,

      language:lang,

      voice:gender,

      audioUrl:
      `http://localhost:${PORT}/audio/${filename}`

    });


  });


});



app.use(
  "/audio",
  express.static(__dirname)
);


app.use(
  "/video",
  express.static(__dirname)
);



async function processQueue(){

  if(isProcessing) return;

  if(queue.length===0) return;


  isProcessing=true;


  const job=queue.shift();


  try{

    await job();

  }catch(err){

    console.error(err);

  }


  isProcessing=false;

  processQueue();

}




app.post("/create-video",(req,res)=>{


const jobId =
"job_"+Date.now();


jobs[jobId]={
status:"queued"
};



queue.push(async()=>{


jobs[jobId].status="processing";


const audioUrl=req.body.audioUrl;

const images=req.body.images || [];


const output =
`video_${Date.now()}.mp4`;



try{


let audioFile=audioUrl;


if(audioUrl.startsWith("http")){


audioFile =
`audio_download_${Date.now()}.mp3`;


execSync(
`curl -o "${audioFile}" "${audioUrl}"`
);


}



const cmd =
`ffmpeg -y -loop 1 -i "${images[0]}" -i "${audioFile}" -c:v libx264 -c:a aac -shortest "${output}"`;



execSync(cmd);



jobs[jobId].status="done";


jobs[jobId].video =
`http://localhost:${PORT}/video/${output}`;



}catch(e){


jobs[jobId].status="error";

jobs[jobId].error=e.message;


}



});



processQueue();



res.json({

success:true,

job_id:jobId,

status:"queued"

});


});




app.get("/job/:id",(req,res)=>{


const job=jobs[req.params.id];


if(!job){

return res.status(404).json({
error:"not found"
});

}


res.json(job);


});




app.listen(PORT,()=>{

console.log(
`🔥 SERVER RODANDO NA PORTA ${PORT}`
);

});
