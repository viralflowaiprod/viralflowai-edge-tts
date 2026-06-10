# ViralFlowAI — Atualização de Interface

## 1. CONFIGURAÇÕES DE API
Na página de configurações, adicione campos de API com ícone de olho para mostrar/ocultar senha:
- **Webhook n8n:** `https://SEU_IP:5678/webhook/viralflow`
- **Pexels API Key**
- **OpenAI API Key**
- **Chaves de cada rede social** (uma por plataforma)

Cada campo deve ter ícone 👁 para visualizar/ocultar o valor.

---

## 2. SELEÇÃO DE PLATAFORMAS
Na tela de geração de vídeo, adicione uma seção "Publicar em" com as opções:
- YouTube
- Instagram
- TikTok
- Kwai
- Pinterest
- Rumble

O usuário seleciona exatamente **4 plataformas**. Cada plataforma selecionada abre uma **janela embutida (iframe/panel)** com preview do conteúdo para aquela rede.

---

## 3. GERAÇÃO CONTÍNUA
Após concluir o primeiro vídeo, o sistema inicia automaticamente o segundo. Mostre uma fila visual com status:
- ✅ Concluído
- ⏳ Gerando
- 🕐 Na fila

---

## 4. AGENDAMENTO
Adicione um sistema de agendamento com as seguintes regras:
- Vídeos prontos antes do horário → agendados para manhã ou horário do almoço
- Próximos dois → próximo horário disponível
- Máximo de **80 vídeos por dia de agendamento**
- Os 80 vídeos de um dia são publicados nos dias seguintes (não no mesmo dia)
- Pequeno **calendário** na interface mostrando quantos vídeos estão agendados por dia
- Ao clicar em um dia no calendário, mostra a lista de vídeos daquele dia

---

## 5. FLUXO COMPLETO
Webhook n8n recebe: `{ "text": "...", "lang": "pt-f" }`
Webhook n8n retorna: `{ "video_url": "https://..." }`

Após receber o `video_url`, o sistema publica automaticamente nas 4 plataformas selecionadas ou agenda conforme as regras acima.
