# AGENTS.md

**Fonte única de guidance para agentes de IA neste repositório** — Claude, Codex, Cursor, Cline, Copilot, etc. Este arquivo atende a **todos** os agentes; **toda adição ou alteração de instrução operacional é feita AQUI**, não em `CLAUDE.md` (que apenas aponta para este arquivo, para evitar duplicação).

## Project Overview

**CortadorLive** is a full-stack pipeline that transforms YouTube livestreams into AI-analyzed clips ready for publication. The workflow: download livestream → transcribe → AI proposes cuts → review & approve → generate metadata/thumbnails → export for YouTube.

## Development Commands

### Start All Services (Local Development)
```powershell
# Windows PowerShell — starts backend, frontend, Remotion, and native worker
.\dev.ps1
# or full startup script
.\iniciar_tudo.ps1
```

Services started:
- Backend (FastAPI) → http://localhost:8000 (docs at `/docs`)
- Frontend (React) → http://localhost:4300
- Remotion Studio → http://localhost:3000
- Native Worker (render job processor) → background Node.js process

### Backend (standalone)
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (standalone)
```bash
cd frontend
npm install
npm run dev      # Vite dev server → http://localhost:4300
npm run build    # Production build → dist/
```

### Video Renderer (standalone)
```bash
cd video-renderer
npm install
npm run dev      # Remotion Studio at http://localhost:3000
```

## Architecture

### Layered Backend (FastAPI)

```
HTTP Routers (app/routers/)         ← FastAPI route handlers
    ↓
Services (app/services/)            ← Business logic, AI/API orchestration
    ↓
Infrastructure (app/infrastructure/) ← External clients: n8n, Gemini, FFmpeg
Domain (app/domain/)                ← Pure utility functions (parsers, converters)
    ↓
SQLite via SQLAlchemy async          ← WAL mode for concurrency
```

- All I/O is **async-first** (yt-dlp downloads, ffmpeg transcoding, Gemini API, n8n webhooks)
- Long-running operations (download, transcription, export) run as fire-and-forget `asyncio` tasks
- **WebSocket** endpoints stream real-time progress updates to the frontend
- AI-heavy work runs through **three paths**: (1) **n8n webhooks** (default for transcript analysis & metadata generation), (2) the **Claude CLI** (`infrastructure/claude_cli_client.py` + `services/claude_ia.py`) — an alternative provider using the local Claude subscription and the versioned expertise in `.claude/skills/`, and (3) the **Gemini API** (`infrastructure/gemini_client.py`) for scene generation, thumbnails, `desvios` and shorts

### Frontend (React 18, Standalone)

Lazy-loaded pages under `frontend/src/features/` (router in `frontend/src/routes.tsx`). State is handled via React hooks and context. All state is derived from backend API responses. Real-time progress via WebSocket connections in the detail page.

Key routes:
| Route | Component | Purpose |
|-------|-----------|---------|
| `/projetos` | ProjetosPage | Project list + creation |
| `/projetos/:id` | ProjetoDetalhePage | Pipeline dashboard |
| `/projetos/:id/cortes` (`/:corteId`) | EditorPage | Cut editor |
| `/projetos/:id/metadados` | MetadataPage | Title, description, thumbnail |
| `/projetos/:id/post-production` | ScenesPostProductionPage | Scene/post-production editing |
| `/projetos/:id/final-review` | FinalReviewPage | Final review before export |
| `/projetos/:id/export` | PostProductionPage | LosslessCut CSV + YouTube publish |
| `/buscar-lives` | LiveSearchPage | Search/download livestreams |
| `/ranking-lives` | RankingLivesPage | Source-live ranking queue |

### Video Renderer (Remotion + Node.js)

`video-renderer/` is a separate Remotion project (React-based video composition). Render jobs are queued in SQLite and processed by `native_worker.js` (long-running Node.js process). The backend's `remotion_render.py` and `cenas_remotion.py` services orchestrate job creation and scene JSON payloads.

### Data Model

Core entities and their status flows:

```
Projeto (StatusProjeto)
  pendente → baixando → transcrevendo → pronto → analisando → analisado (| erro)
  └── Corte[] (StatusCorte)
        proposto → aprovado → editado → processado  (| rejeitado)
        └── MetadadoCorte (1:1)
        └── Short[] (StatusShort)
              sugerido → aprovado → renderizado  (| rejeitado)
              └── MetadadoShort (1:1)
```

All SQLAlchemy models are in `backend/app/models.py`. All TypeScript interfaces mirror these in `frontend/src/types/models.ts`.

## Configuration

Backend reads from `backend/.env` (pydantic-settings via `app/config.py`). Key variables:

```
N8N_WEBHOOK_ANALISE=<webhook_id>       # n8n workflow for transcript analysis
N8N_WEBHOOK_METADADOS=<webhook_id>     # n8n workflow for metadata generation
GEMINI_API_KEY=<key>                   # Google Gemini (thumbnails, scene gen)
YOUTUBE_API_KEY=<key>                  # YouTube Data API v3 (search)
PROJETOS_DIR=projetos/                 # Where project files are stored
ASSETS_DIR=assets/                     # Intro/outro videos, guides
```

The channel's identity (handle/nome/crédito) and the source channel for lives (`youtube_channel_id`) are **not** set here — they are configured per channel in that channel's `channel.yaml` (via the Canais UI), read through `channels.identidade_do_canal_ativo()`.

## Key Domain Concepts

- **Projeto**: A YouTube livestream download + processing session. Each project maps to a directory under `backend/projetos/<id>/`.
- **Corte**: A proposed or approved video segment, defined by `inicio_hms`/`fim_hms` timestamps. Cuts can have `desvios` (detected anomalies/highlights).
- **Short**: A vertical/TikTok-style derivative clip generated from a `Corte`.
- **Ingestão**: The pipeline phase that downloads the video via yt-dlp and parses the VTT subtitle file into the database.
- **Análise**: The phase where the transcript is sent to n8n → AI → returns proposed cuts.
- **Export**: Produces a LosslessCut-compatible CSV + optionally normalizes/concatenates clips via ffmpeg.

## Coding Rules

This project enforces skill-based guidelines (see `.claude/rules/`):

- **Backend**: Apply `@clean-code`, `@domain-driven-design`, and `@uncle-bob-craft` principles.
- **Frontend**: Apply `@react-best-practices`, `@senior-frontend`, and `@ui-skills` principles.
- **Remotion**: Same as frontend plus `@remotion-best-practices`.

---

## Protocolo de Alteração (Lock de Funcionalidades)

> **Esta seção vale para qualquer agente de IA — Claude, Cursor, Codex, Cline, Copilot, etc.**

### Antes de editar QUALQUER arquivo

1. Verifique se ele aparece em [`.guia/locks/registry.yaml`](.guia/locks/registry.yaml).
2. Se aparecer, **o arquivo está TRAVADO**: você pode lê-lo, mas **não pode editar, deletar, renomear, mover, nem criar substituto em outro caminho**.
3. Antes de pedir desbloqueio, explique: `id` da trava, descrição/funcionalidade protegida, por que a mudança toca nela, impacto esperado, risco de regressão e alternativa sem mexer no arquivo travado.
4. Para destravar, **peça autorização explícita ao desenvolvedor**. Não decida sozinho. Não tente burlar (renomear arquivo, refazer noutro lugar, dividir em vários).
5. Se o arquivo NÃO aparece no registry, edite normalmente — respeitando os princípios abaixo.

### Como o desbloqueio funciona

Quando o desenvolvedor autorizar, ele incluirá no commit a marca:

```
[unlock:<feature-id>] motivo: <razão curta>
```

O hook `.githooks/commit-msg` e o workflow `.github/workflows/lock-check.yml` validam isso. Sem a marca, o commit é rejeitado (local e/ou no PR).

### Comandos úteis

```powershell
# Listar travas ativas
python bin/check-lock.py list

# Checar se um conjunto de arquivos está travado
python bin/check-lock.py check backend/app/services/ingestao.py

# Instalar o hook git (uma vez por clone)
git config core.hooksPath .githooks
```

---

## Protocolo de execução concorrente (worktree)

> **Vale para qualquer agente — Claude, Codex, Cursor, etc.** Lições da retrospectiva
> da Vistoria 2 (épicos E-001..E-005). O `guia:finish` faz `git add -A`: numa árvore
> compartilhada ele varre edits soltos de OUTRA sessão e os funde no commit errado.

- **Um worktree isolado por chip concorrente** (ou serialize os chips). Chips paralelos
  que compartilham a mesma árvore de trabalho contaminam os commits uns dos outros —
  isole cada frente em seu worktree/branch ou rode uma de cada vez.
- **Commit atômico por arquivo:** `git add -- <arquivo>` e `git commit -- <arquivo>`.
  Sob concorrência, **nunca** `git add -A` nem `git commit` sem pathspec — eles capturam
  o trabalho em andamento das outras sessões.
- **Janela mínima do bypass do `lock-ignore.txt`:** editar o arquivo travado → commitar
  na hora com a marca `[unlock:<id>]` → restaurar o `lock-ignore.txt` no mesmo passo.
  Não deixe o bypass ativo durante pausas longas (AskUserQuestion, testes, análise) —
  um `git add -A` de um `finish` concorrente commitaria o travado sem a marca.
- **Stories que reescrevem histórico** (remoção de segredo via `git filter-repo` e afins)
  rodam **serializadas, sozinhas**, com o motor Guia Fluxo e o backend **pausados** —
  o rewrite muda todos os SHAs e não tolera outra sessão gravando na árvore ao mesmo tempo.

---

## Princípios de Engenharia (aplicar com pragmatismo)

Esta é uma aplicação pessoal. Aplique o que faz sentido para o tamanho do projeto; **não invente abstrações para o futuro**. Quando em dúvida sobre escopo, prefira o caminho mais direto.

### Testes
- Código novo em `domain/` ou `services/` nasce com pelo menos um teste de caminho feliz.
- Se uma alteração quebra teste existente, a tarefa **não** está pronta — investigue a causa antes de continuar.

### Clean Code (Uncle Bob)
- Nomes intencionais: verbos para funções, substantivos para entidades de domínio.
- Funções pequenas, com uma responsabilidade clara.
- Comente o "porquê" não-óbvio; nunca o "o quê" (o nome já diz).
- Sem código morto, sem TODO genérico, sem `console.log` / `print` esquecidos.

### Clean Architecture
Camadas e dependências do backend:

```
routers/ (HTTP)  →  services/ (orquestração)  →  domain/ (puro)
                                              ↘  infrastructure/ (n8n, Gemini, FFmpeg)
```

- `domain/` é **puro**: sem FastAPI, sem SQLAlchemy, sem HTTP, sem cliente externo.
- Routers só convertem HTTP ↔ serviço; nada de lógica de negócio.
- Frontend: componente "burro" (UI/JSX) separado de hook/serviço (lógica + I/O).

### DDD pragmático
- Cada feature travada em `registry.yaml` corresponde aproximadamente a um bounded context.
- Vocabulário do domínio (`Projeto`, `Corte`, `Short`, `Metadado`, `Ingestão`, `Análise`) é **consistente** em código, banco e UI — não invente sinônimos.
- Status enums (`StatusProjeto`, `StatusCorte`, `StatusShort`) são parte do contrato; mudanças exigem migração de banco.

### Não-regressão
- Não "limpe" código adjacente ao que você precisa mudar. Refactor de brinde = PR separado.
- Antes de declarar uma tarefa pronta: rode os testes que tocam a área alterada.
- Em mudanças de UI: teste no navegador, não confie só no type-check.

### Em caso de dúvida
**Pergunte antes de editar.** O custo de uma pergunta é baixo; o custo de uma regressão silenciosa em algo já estável é alto.
