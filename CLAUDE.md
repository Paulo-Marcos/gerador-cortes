# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **📌 Fonte única: [`AGENTS.md`](AGENTS.md).** As instruções operacionais para agentes
> de IA vivem no `AGENTS.md`, que atende a **todos** os agentes. **Toda adição ou
> alteração de guidance é feita no `AGENTS.md`** — não duplique aqui. As seções abaixo
> permanecem por compatibilidade; havendo divergência, o `AGENTS.md` prevalece.

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

`video-renderer/` is a separate Remotion project (React-based video composition). Render jobs use a **filesystem queue** (no DB table): the backend writes `req_{job_id}.json` into the render queue dir and waits — via `watchfiles.awatch` — for the worker's `res_{job_id}.json` (protocol in `infrastructure/worker_queue.py`). `native_worker.js` (long-running Node.js process) processes the jobs. The backend's `remotion_render.py` and `cenas_remotion.py` services orchestrate job creation and scene JSON payloads.

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

The `n8n-workflows/` folder contains the exported n8n workflow JSONs that must be imported into n8n before analysis or metadata generation will work.

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

### Roteamento de skills por escopo

Cada escopo já tem uma rule em `.claude/rules/` com `paths:` declarativo. Resumo do mapa:

- `backend/**` → `clean-code`, `uncle-bob-craft`, `domain-driven-design` (pragmático), `clean-architecture-guardian` (macro), `clean-code-review` (micro)
- `frontend/**` → `react-best-practices`, `senior-frontend`, `ui-skills`, `clean-architecture-guardian`, `clean-code-review`
- `video-renderer/**` → `remotion-best-practices`, `react-best-practices`, `senior-frontend`, `ui-skills`

**Nunca** usar skills Angular (o frontend é React + Vite) — elas estão desligadas via `skillOverrides` em `.claude/settings.json`. As skills `tdd-react`/`tdd-dotnet` pertencem a outro projeto; ignorar aqui.

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

# Confirmar que o hook está de fato ativo (deve retornar ".githooks", não ".git/hooks")
git config --get core.hooksPath
```

> **Atenção:** `core.hooksPath` é config **local** (não versionada) — cada clone/worktree novo começa sem ela, e uma ferramenta ou IDE pode sobrescrevê-la de volta para o default (`.git/hooks`) sem avisar (ocorreu no D-261: o hook `commit-msg` ficou inativo por vários commits sem ninguém perceber). Se um commit tocar arquivo travado e **não** for bloqueado, rode o comando de confirmação acima antes de investigar qualquer outra causa.

---

## Padrão de Commit (Conventional Commits + gitmoji)

> **Decisão D-091 (E-006).** Vale para qualquer agente — Claude, Codex, Cursor, etc. — e para commits manuais.

Toda mensagem de commit segue **Conventional Commits + gitmoji ANTES do tipo**, descrição em **português no imperativo**:

```
<emoji> <tipo>(<D-NNN>): <descrição imperativa, minúscula, sem ponto final>

[corpo opcional: explique o PORQUÊ, não o "o quê"]

[unlock:<feature-id>] motivo: <razão>   ← só quando tocar arquivo travado
Co-Authored-By: <nome> <email>           ← em commits assistidos por IA
```

**Tipos canônicos** (use `feat`, **não** `feature`; `fix`, **não** `bug`) e seu emoji:

| Tipo | Emoji | Quando |
|------|-------|--------|
| `feat` | ✨ | nova capacidade/funcionalidade |
| `fix` | 🐛 | correção de bug/regressão |
| `refactor` | ♻️ | reestrutura sem mudar comportamento |
| `chore` | 🧹 | manutenção, deps, config, tooling |
| `docs` | 📝 | documentação |
| `style` | 🎨 | formatação (ruff/Prettier), sem lógica |
| `test` | ✅ | testes |
| `perf` | ⚡ | performance |
| `ci` | 👷 | pipeline/CI |
| `merge` | 🔀 | merge de branch/worktree |

Regras:

1. **Escopo `(D-NNN)`** no header sempre que houver tarefa Guia Fluxo (use `(E-NNN)` para épico). Sem tarefa, omita o escopo.
2. **Um commit por funcionalidade.** Se o stage mistura assuntos diferentes, **divida** com staging seletivo (`git add -p` / por arquivo) e faça commits separados — não agrupe frentes distintas num só commit. Quando o pipeline entrelaça hunks e a divisão é inviável, registre o motivo no corpo.
3. A skill [`conventional-commit-gitmoji`](.claude) é a referência de redação e bloqueia stage misto.
4. **Vale daqui pra frente** — não reescreva histórico legado (`feature(...)` sem emoji).

### Quem emite a mensagem

O default do engine Guia Fluxo (`finish` → `bin/_commit.py`) gera `feature: <título>` **sem emoji nem escopo no header** — formato legado. Esse default **deve ser sobrescrito por commit manual** seguindo o padrão acima sempre que houver tarefa e/ou arquivo travado (cenário em que o `finish` roda com `--no-commit` e o commit é feito à mão com as marcas `[unlock:]`).

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
