# CortadorLive ✂️

> Pipeline completo para transformar transmissões ao vivo do YouTube em cortes analíticos prontos para publicação.

## Início Rápido

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- [Node.js 20.17+](https://nodejs.org/) (para o frontend Angular)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado no PATH (para desenvolvimento local sem Docker)

### 1. Configurar variáveis de ambiente

```bash
cp backend/.env.example backend/.env
# Edite backend/.env e preencha:
# - N8N_WEBHOOK_ANALISE=<id do webhook criado no n8n>
# - N8N_WEBHOOK_METADADOS=<id do webhook criado no n8n>
# - GEMINI_API_KEY=<sua chave do Google AI Studio>
```

### 2. Subir o backend e o n8n

```bash
docker compose up -d
```

- **n8n**: http://localhost:5678
- **Backend API**: http://localhost:8000
- **Docs da API**: http://localhost:8000/docs

### 3. Configurar workflows no n8n

1. Acesse http://localhost:5678 e crie uma conta
2. Importe os workflows de `n8n-workflows/`:
   - `analise-transcricao.json` → copie o Webhook ID para `.env` em `N8N_WEBHOOK_ANALISE`
   - `gerar-metadados.json` → copie o Webhook ID para `.env` em `N8N_WEBHOOK_METADADOS`
3. Rode `docker compose restart backend` para carregar o `.env` atualizado

### 4. Subir o frontend

```bash
cd frontend
npm install
npm start
```

Frontend disponível em: http://localhost:4200

---

## Estrutura do Projeto

```
cortador-live/
├── docker-compose.yml          # n8n + backend
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py             # FastAPI app
│       ├── models.py           # SQLAlchemy: Projeto, Corte, MetadadoCorte
│       ├── database.py         # SQLite async
│       ├── config.py           # Settings via pydantic-settings
│       ├── routers/
│       │   ├── projetos.py     # CRUD projetos + WebSocket progresso
│       │   ├── cortes.py       # CRUD cortes + aprovação
│       │   ├── metadados.py    # Geração e edição de metadados YouTube
│       │   └── export.py       # CSV LosslessCut + dashboard de publicação
│       └── services/
│           ├── ingestao.py     # yt-dlp download + parsing VTT
│           ├── analise.py      # n8n: análise de transcrição → cortes
│           ├── metadados.py    # n8n: título/desc/tags/prompt thumbnail
│           ├── thumbnail.py    # Gemini Imagen API
│           └── export.py       # ffmpeg: normalização áudio + concat intro/outro
├── frontend/
│   └── src/app/
│       ├── pages/
│       │   ├── projetos/           # Lista e criação de projetos
│       │   ├── projeto-detalhe/    # Pipeline visual de 5 fases
│       │   ├── cortes-editor/      # Player + revisão de cortes
│       │   ├── metadados/          # Geração e edição de metadados
│       │   └── export/             # Dashboard de publicação
│       ├── services/api.service.ts # Cliente HTTP central
│       └── models/models.ts        # Tipos TypeScript
└── n8n-workflows/                  # Exportações dos workflows n8n (JSON)
```

## Pipeline de Uso

```
1. Acesse http://localhost:4200
2. Crie um Projeto → cole a URL da live do YouTube
3. O sistema baixa o vídeo e extrai as legendas automaticamente
4. Clique "Iniciar Análise IA" → n8n analisa e propõe os cortes
5. Revise cada corte no Editor (player + aprovação/rejeição)
6. Exporte CSV → abra no LosslessCut para ajuste fino
7. Gere Metadados + Thumbnails com IA para cada corte aprovado
8. Importe os clipes do LosslessCut e processe com ffmpeg
9. Pasta upload_ready/ tem tudo pronto para o YouTube Studio
```

## Variáveis de Ambiente (backend/.env)

| Variável | Descrição |
|----------|-----------|
| `N8N_BASE_URL` | URL do n8n (padrão: http://localhost:5678) |
| `N8N_WEBHOOK_ANALISE` | ID do webhook de análise de transcrição |
| `N8N_WEBHOOK_METADADOS` | ID do webhook de geração de metadados |
| `GEMINI_API_KEY` | Chave da API Gemini (Google AI Studio) |
| `PROJETOS_DIR` | Diretório onde os vídeos são salvos |
| `ASSETS_DIR` | Diretório dos assets (intro, outro) |

## Intro/Outro

Coloque seus arquivos de intro e outro no diretório `backend/assets/intro/`:
- `intro.mp4` — intro concatenado no início de cada corte
- `outro.mp4` — (opcional) outro concatenado no final

---

**Canal**: @ateuinforma · Produção: CortadorLive v1.0
