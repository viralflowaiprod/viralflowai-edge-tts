FROM node:22

# =========================
# DEPENDÊNCIAS DO SISTEMA
# =========================
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# =========================
# EDGE TTS
# =========================
RUN pip3 install edge-tts --break-system-packages

# =========================
# APP
# =========================
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
