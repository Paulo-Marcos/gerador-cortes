# CortadorLive ✂️

[![CI](https://github.com/Paulo-Marcos/gerador-cortes/actions/workflows/ci.yml/badge.svg)](https://github.com/Paulo-Marcos/gerador-cortes/actions/workflows/ci.yml)

> CortadorLive é o pipeline que leva uma live do YouTube até o corte pronto para publicar — baixa, transcreve, propõe cortes com IA e entrega metadados e thumbnails, para você só revisar e exportar.

## Início Rápido

### Pré-requisitos

- [Node.js 20+](https://nodejs.org/) (para o frontend e Remotion)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado no PATH
- [Claude Code CLI](https://claude.ai/code) instalado no PATH (provedor de IA para análise de cortes e metadados — usa sua assinatura do Claude)

### 1. Configurar variáveis de ambiente

```bash
cp backend/.env.example backend/.env
# Edite backend/.env e preencha:
# - GEMINI_API_KEY=<sua chave do Google AI Studio>  (thumbnails e cenas)
```

A geração de IA (análise de cortes, metadados, desvios, resumo) roda pelo **Claude CLI**
(provedor local, usa a assinatura do Claude — veja `backend/app/services/claude_ia.py` e
`backend/app/infrastructure/claude_cli_client.py`). Ele é controlado pelas settings
`CLAUDE_CLI_*` em `backend/app/config.py` (ex.: `CLAUDE_CLI_ENABLED`, `CLAUDE_CLI_PATH`,
`CLAUDE_CLI_TIMEOUT`) e já vem habilitado por padrão.

### 2. Subir o backend

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- **Backend API**: http://localhost:8000
- **Docs da API**: http://localhost:8000/docs

### 3. Subir o frontend (React)

```bash
cd frontend
cp .env.example .env.local    # opcional, default ja aponta para localhost:8000/api
npm install
npm run dev                   # → http://localhost:4300
```

Para subir tudo (React + backend + Remotion + worker) num único terminal:

```powershell
.\dev.ps1
```

---

## Estrutura do Projeto

```
cortador-live/
├── docker-compose.yml          # backend
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
│           ├── analise.py      # via Claude: análise de transcrição → cortes
│           ├── metadados.py    # via Claude: título/desc/tags/prompt thumbnail
│           ├── thumbnail.py    # Gemini Imagen API
│           └── export.py       # ffmpeg: normalização áudio + concat intro/outro
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── projetos/           # Lista e criação de projetos
│       │   ├── projeto-detalhe/    # Pipeline visual de 5 fases
│       │   ├── cortes-editor/      # Player + revisão de cortes
│       │   ├── metadados/          # Geração e edição de metadados
│       │   └── export/             # Dashboard de publicação
│       ├── services/               # Cliente HTTP central
│       └── types/models.ts         # Tipos TypeScript
└── video-renderer/                 # Projeto Remotion + worker de render
```

## Pipeline de Uso

```
1. Acesse http://localhost:4300
2. Crie um Projeto → cole a URL da live do YouTube
3. O sistema baixa o vídeo e extrai as legendas automaticamente
4. Clique "Iniciar Análise IA" → o Claude analisa a transcrição e propõe os cortes
5. Revise cada corte no Editor (player + aprovação/rejeição)
6. Exporte CSV → abra no LosslessCut para ajuste fino
7. Gere Metadados + Thumbnails com IA para cada corte aprovado
8. Importe os clipes do LosslessCut e processe com ffmpeg
9. Pasta upload_ready/ tem tudo pronto para o YouTube Studio
```

## Variáveis de Ambiente (backend/.env)

| Variável | Descrição |
|----------|-----------|
| `CLAUDE_CLI_ENABLED` | Habilita o Claude CLI como provedor de IA (default: ligado) |
| `CLAUDE_CLI_PATH` | Caminho do binário `claude` (default: resolvido pelo PATH) |
| `CLAUDE_CLI_TIMEOUT` | Timeout das chamadas ao Claude CLI |
| `GEMINI_API_KEY` | Chave da API Gemini (Google AI Studio — thumbnails e cenas) |
| `PROJETOS_DIR` | Diretório onde os vídeos são salvos |
| `ASSETS_DIR` | Diretório dos assets (intro, outro) |

## Intro/Outro

Coloque seus arquivos de intro e outro no diretório `backend/assets/intro/`:
- `intro.mp4` — intro concatenado no início de cada corte
- `outro.mp4` — (opcional) outro concatenado no final

---

## Deploy / Produção

> Para o guia completo de setup, veja [docs/SETUP.md](docs/SETUP.md). Problemas conhecidos de
> instalação e do render pipeline estão em [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

### Backend

```bash
# 1. Variáveis de ambiente de produção
cp backend/.env.production.example backend/.env
# Edite backend/.env com os valores reais: chaves de API, diretórios

# 2. Configuração do canal
cp backend/app/canal_config.py.example backend/app/canal_config.py
# Edite com os prompts e dados do seu canal

# 3. Iniciar o servidor
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

### Frontend

```bash
cd frontend
# Ajuste frontend/.env.production se o backend não estiver em localhost:8000
npm run build     # gera dist/ com os assets otimizados
# Sirva dist/ com qualquer servidor HTTP estático (nginx, caddy, serve…)
```

---

**Produção**: CortadorLive v1.0
