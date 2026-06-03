Serve.js que deu certo Git Hub 
const express = require("express");

const app = express();
app.use(express.json());

// STATUS
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "ViralFlowAI Edge TTS",
    status: "online"
  });
});

// TESTE OBRIGATÓRIO
app.get("/tts", (req, res) => {
  res.json({
    success: true,
    route: "tts working"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
