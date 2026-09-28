# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Architectural deep-dives that predate this file are preserved as historical
> narrative in [`docs/interno/historico-arquitetura-2026-05.md`](docs/interno/historico-arquitetura-2026-05.md). New changes are tracked
> here in the standardized Keep a Changelog format.

## [Unreleased]

### Added
- **Generate covers in your own ChatGPT, without copy and paste.** A
  "Gerar no ChatGPT" button on the YouTube thumbnail (16:9), the TikTok art
  (4:5) and the Short cover (9:16) drives the operator's Edge: it opens a new
  chat in the channel's ChatGPT project, attaches the mascot sheets, pastes
  the prompt, waits for the image and sends it through the same upload as
  Ctrl+V, so frames and cover assembly still apply. It uses the ChatGPT
  subscription, not the paid API. The project link and the sheets are set per
  channel in Canais → Capas no ChatGPT (D-804).
- **A size gate for source files.** A test now fails when a code file in the
  backend, frontend or renderer goes over 500 lines. The 61 files that were
  already over the limit are listed with today's size as a ceiling; the list
  can only shrink. The old check asked the agent to judge size by itself and
  never caught a single file (D-771).
- **A size gate for functions.** Python functions are measured by cyclomatic
  complexity (limit 10) and statement count (limit 40); frontend functions,
  React components included, by lines (limit 100). What was already over the
  limit is listed per function with today's measure as a ceiling — 39 entries
  for 28 Python functions (a function can break both rules) and 121 frontend
  functions — and the lists can only shrink (D-772).
- **Type checking for the backend.** Pyright (the engine behind VS Code's
  Pylance) now checks `backend/app` in basic mode. The 175 type errors that
  already existed are counted per file and rule; a new one fails the build,
  and the counts can only go down (D-773).
- **`bin\release.ps1` prepares a release in one command.** It refuses a dirty
  tree, a branch other than `main`, an existing tag or an empty
  `[Unreleased]`; checks the requested version against the one the changelog
  categories call for; runs the full quality gate; bumps every copy of the
  version; closes `[Unreleased]`; and creates the release commit and the
  annotated tag. It never pushes: it ends by printing the publishing steps —
  push `main`, wait for green CI on that exact commit, then push the tag
  (D-782).
- **Shorts on demand, grouped by live.** The Shorts screen now groups cuts by
  the live they came from. Each cut has a "Gerar shorts com IA" button (it
  rebuilds a missing raw clip first), and each live has one button that
  downloads a cleaned-up live again, rebuilds the missing raw clips and asks
  the AI for shorts, one cut at a time. Until now the automatic step only ran
  when a raw clip finished rendering, so a Fire marked later, a cut flagged by
  hand, or a failed AI call was left without shorts (D-803).

### Changed
- **Generating shorts again adds to the queue instead of replacing it.**
  Pending AI suggestions are no longer deleted; a new suggestion that overlaps
  an existing candidate is dropped and listed in `descartes` (RN-26, D-803).
- **Node.js 24 is now the minimum.** Node 20 reached end of life on
  2026-04-30 and no longer gets security fixes; the bootstrap refuses it and
  points to the Node 24 LTS download. Production already runs 24 (D-781).
- **CI also runs weekly and on demand.** Besides every push, the full CI runs
  every Monday on `main` and from the Actions tab, to catch a dependency
  release that breaks the build without any code change (D-781).

### Fixed
- **Rebuilding a Fire's raw clip from the Shorts screen no longer calls the AI
  twice.** The raw clip step already suggests shorts for a Fire; the manual
  path now skips its own call when that step succeeded (D-803).
- **The cut's metadata modal edits again.** Opened from the cut list, it had
  become read-only in 0.4.0; it now offers the same actions as the metadata
  screen — generating and picking titles, the cover prompt, images (D-767).
- **The next-cut marker is back on the editor timeline.** It stopped showing
  in 0.4.0 because the position was no longer passed down to the timeline
  (D-768).
- **Clicking a queue row shows each run again.** The queue drawer and the
  `/fila` page expand a row into the state, timings, error and timeline of
  every run of that item, as the old modal did before 0.4.0 (D-769).

### Removed
- **Development skills are no longer vendored in the repository.** The seven
  coding skills (`clean-code`, `react-best-practices`, `remotion-best-practices`
  and others) and the script that mirrored them from `.claude/skills` to
  `.agents/skills` are gone: they are about how to write code, not about the
  app, and now live in the maintainer's global skills. The per-folder rules in
  `.claude/rules` and `.agents/rules` keep the essentials of each scope and
  work without any skill installed. The app's editorial skills were already
  per channel, in the database, and are untouched (D-775).

### Security
- **Vite 6.4.3 and patched frontend/renderer packages.** The screen is served
  by Vite's server, and Vite 5 let Windows-specific alternate paths bypass
  the list of files it refuses to serve (`server.fs.deny`). Along with it,
  `vitest`, `react-router-dom`, `js-yaml`, `fast-uri`, `brace-expansion` and
  others move to fixed versions: high advisories go from 6 to 0 across both
  packages. Two moderate `react-router` advisories remain; their fix is
  React Router 7, a migration of its own. CI now fails on high advisories,
  not only critical ones (D-808).
- **A live's URL can no longer smuggle options into yt-dlp.** The URL went
  straight into yt-dlp's command line, so a "URL" such as `--exec=...` was read
  as an option — and `--exec` runs a command. The address is now checked
  (exact YouTube host, 11-character video id) when the project is created,
  and what reaches yt-dlp is rebuilt from the id, after a `--`. Pasted URLs
  without `https://` and bare video ids keep working. Found by CodeQL, which
  this release turns on (D-807).
- **Python dependencies are locked with hashes.** `requirements.txt` is now
  generated from `requirements.in` and pins the whole tree — 73 packages
  instead of the 23 listed by hand — with the hash of every file, for Windows
  and Linux. Two installs on different days get the same packages, and pip
  refuses a file whose hash does not match. A test fails when the environment
  running the tests drifts from the lock (D-796).
- **Every GitHub Action is pinned to a commit SHA.** The workflows used
  version tags (`@v7`), which the action's owner can move to other code;
  they now name the exact commit, with the version in a comment for
  Dependabot to update both together. A test fails when a workflow uses an
  action by tag again (D-780).
- **Workflows declare what their token may do.** CI and the lock check now
  read the code and nothing else; before, their token inherited the
  repository default, which can write. A test requires `permissions:` in
  every workflow (D-809).
- **Claude Code is denied the app's secrets.** The project's Claude Code
  settings deny reading and editing `.env`, `token.json`,
  `client_secrets.json` and the SQLite databases, and reading `~/.ssh` and
  `~/.aws`. It covers Claude Code's file tools and the shell commands it
  recognizes as reads; it does not cover every interpreter a script could
  run, nor other agents (Codex, Antigravity), which have their own settings.
  Before this, nothing stopped an agent from opening the operator's real
  YouTube OAuth credentials (D-770, D-800).

## [0.4.0] - 2026-09-27

233 commits since 0.3.0. This is a **structural release**: almost nothing new on
screen, a lot less that can break underneath. The backend's layers now point one
way, the frontend talks to the API through a generated client, the render
contract is written once, and the three UI shells became one.

### Added
- **AI through an API key.** Claude can now run through the Anthropic Messages
  API with the operator's own key, for installations without Claude Code or
  Antigravity. It is opt-in (`IA_CLAUDE_TRANSPORTE=api` in `backend/.env`); the
  default stays on the subscription CLI. Same queue, JSON contract and telemetry
  as the other transports (D-720).
- **Versioned contracts for the render worker.** The scene has one definition —
  the renderer's zod schema — shared by the preview, the render and the backend
  (as a generated JSON Schema checked by tests on both sides). Worker jobs carry
  a protocol version; a job the worker cannot run is answered with a clear error
  instead of failing inside the process (D-725).

### Changed
- **One UI shell.** The legacy and Workbench shells are gone; the new shell,
  already in production since 0.3.0, is the only one (ADR-0017, D-726 to D-728).
- **The frontend uses a client generated from the OpenAPI contract**, with typed
  requests and responses; hand-written fetches and duplicated types are gone
  (D-721 to D-723).
- **React 19.** The frontend moved to the renderer's React version (19.2.3), so
  scene previews run on the same React as the render (D-734).
- **Smaller downloads per update.** React, data access and Remotion ship in their
  own bundle chunks, so an app update only replaces the app's code; Remotion
  loads only on the post-production page (D-735).
- **The editor's player tick is cheaper.** Panels that do not depend on the
  playhead no longer re-render four times a second: React render per tick fell
  by about 45% in an A/B measurement (D-740).
- **Backend layers are enforced.** Domain rules live in `domain/`, external
  clients in `infrastructure/`, and import-linter contracts fail the build on a
  wrong-way import; the app has no import cycles left (E-051 to E-055).
- **Domain errors become HTTP responses by meaning**, through one global handler
  (D-697).
- **One schema-evolution path.** The `projetos.db` schema evolves only at boot:
  new columns come from the models, transformations from versioned migrations
  (D-701).

### Fixed
- **Cut layouts keep inheriting from the project and global defaults.** Saving a
  cut's layout wrote every default into it, so later changes to the project's
  stage stopped reaching that cut. Only the keys that changed are saved now
  (RN-10, D-741).
- **Downloads can no longer hang forever.** yt-dlp now stops after ten minutes
  without any output (the download itself may take hours) and the project shows
  the error; subtitles and live chat got overall time limits (D-753).
- **Live credit goes to the channel the live came from**, not to the publishing
  channel, when no source channel was typed (D-714).
- **Assisted upload no longer drives the other platform's Chrome.** When the
  TikTok and Instagram profiles hash to the same debugging port, a batch opening
  both at once could hand one robot the other's window. Chrome launches are now
  serialized, and a profile whose window had moved to the next port finds it
  again instead of trying to open a second Chrome over it (D-761).
- **FFmpeg helper honors its advertised timeout** (D-750), and the backend test
  suite no longer touches the developer's real databases (D-760).

### Removed
- The legacy and Workbench shells and their feature flags (`VITE_UPGRADE_SHELL`,
  `VITE_WORKBENCH`); rollback is now git (D-728).
- The `SettingsModal`, unreachable since the legacy sidebar left; preferences
  live in Settings → Application (D-724).

## [0.3.0] - 2026-09-22

564 commits since 0.2.0. The headline is **vertical shorts end to end** and a
**redesigned workbench**; the release also makes the app installable by someone
other than its author.

### Added
- **Shorts, from candidate to published post.** The AI proposes short candidates
  over the raw cut's transcript (D-454), you curate them (D-459), trim by frame
  or typed timecode (D-478, D-482), and the render runs in two stages — preview
  then finalization — with progress and worker log on screen (D-483, D-485,
  D-568). A short can be built from several segments of the raw cut (D-604).
- **Stage composition instead of cropping.** The 9:16 frame is recomposed on a
  *palco*: named crop regions placed into slots, with the channel's texture and
  chrome, editable live on the preview and reusable as presets (D-486 to D-509,
  D-559, D-561, D-562). The cut carries a default stage that its shorts inherit
  live (D-570). Face-aware framing picks the speaker (D-464, D-477).
- **Burned-in captions and an opening hook.** TikTok-style animated captions with
  font, highlight color and vertical position chosen before the render (D-462,
  D-563, D-605), plus a 4–7-word opening hook card that can be dragged and
  resized on the frame, generated by an editable channel skill (D-565, D-600).
- **Publishing to three platforms.** YouTube through the official API; TikTok and
  Instagram Reels through **assisted** upload that drives your own Chrome and
  stops before the publish button (experimental — see
  [ADR-0009](docs/adr/0009-publicacao-assistida-experimental.md)). Batch publish
  runs platform by platform (D-564), with scheduling (D-580), re-publish (D-590),
  manual "already published" marking (D-603) and upload percentage in the log.
- **Covers.** TikTok and short covers are built from a frame of the video, with
  AI art on a middle band, a label written by a channel skill, the channel frame,
  and a layout editor in Configurações (D-519 to D-556, D-586).
- **A redesigned workbench (D-386 to D-402, D-599, D-610, D-746).** New shell
  with tab rail, global queue, collapsible panels, five themes and an accent
  color; Library remembers filter and order; cut cards show stage and status;
  ⌘K finds cuts and shorts; keyboard-first triage. Editable shortcuts for every
  action (D-394) and a Shortcuts page (D-393).
- **Editorial v2 for cut analysis (D-302).** Cuts are proposed as self-sufficient
  stories — strongest-entry-point hook, opening contextualization, priority
  score, 5/8–18/30-minute bands, diarization-aware rules, 55–60-character titles
  — and the trechos skill becomes a cohesion editor that may revise desvios.
- **Editorial telemetry (D-303, D-353, E-022).** The AI proposal is frozen as an
  immutable snapshot; an Analytics area compares proposal vs. final cut per
  project and across projects, and every LLM call is recorded.
- **Per-channel editorial skills in the database, with UI (E-021, D-297, D-312).**
  Five skills plus prompts and scaffolds live per channel, versioned append-only
  with revert and audit — not in `.claude/skills`.
- **A second AI provider.** Gemini through the Antigravity CLI (`agy`), on your
  own subscription, selectable per step with a badge saying who generated what,
  plus a manual mode ([ADR-0004](docs/adr/0004-provedores-de-ia-v2.md)).
- **Speaker diarization (D-286, D-296, D-360)** labelling channel vs. guests, and
  local ASR transcription of the raw cut (D-461).
- **Onboarding for a new install.** `bin/bootstrap.ps1` (D-630), a Prerequisites
  card that says what the machine is missing and what each optional tool unlocks
  (D-627), an in-app YouTube OAuth walkthrough (D-628), and a rewritten
  [README](README.md) and [SETUP](docs/SETUP.md).
- **Versioned HTTP contract** in `backend/openapi.json` with a drift test (D-664),
  **domain-owned lifecycles** for Projeto and Corte (D-665), and a documented
  domain: [context map](docs/dominio/mapa-de-contextos.md),
  [glossary](docs/dominio/glossario.md) and
  [business rules RN-01..RN-25](docs/dominio/regras-de-negocio.md) (D-667).
- **Fourteen ADRs** recording the decisions behind this release (D-673).

### Changed
- **Render is faster and bounded.** Pre-composed stage backgrounds cut grade time
  by ~16% (D-415); two render slots run with RAM back-pressure (D-441); the final
  encoder is chosen in Configurações and falls back to `libx264` without an Intel
  iGPU (D-622). Remotion loads only the fonts of the preset in use (D-642), and
  the bundle fingerprint includes the lockfile (D-643).
- **The project list endpoint is ~4x faster** and no longer churns memory (D-431):
  deferring the transcript column drops the query from 1649ms to 250ms and the
  per-request peak from 80.2 MB to 0.6 MB.
- **No more 30% ceiling on removed desvios** — removal is governed by a semantic
  guardrail and watched by telemetry (D-302).
- **Configuration moved into the database, per channel** (identity, theme,
  mascot, ranking weights, skills), editable on screen
  ([ADR-0012](docs/adr/0012-onde-vive-cada-configuracao.md)).
- **Windows is the only supported platform**
  ([ADR-0008](docs/adr/0008-plataforma-windows.md)); CI now runs a
  `windows-latest` job with bootstrap, clean boot and pytest (D-688), plus a
  Python 3.11/3.13 and Node 20/24 matrix (D-687).
- **Guard-rails that fail the build:** import-linter layer contracts (D-662),
  ESLint folder boundaries (D-663), the OpenAPI drift test (D-664), a mojibake
  test (D-668), a single-version check (D-686) and a commit-message check in the
  hook and in CI (D-684).
- **One version for the whole app**, sourced from `VERSION` (D-686), and
  `AGENTS.md` as the single source of instructions for AI agents (D-672).

### Fixed
- Missing model columns in an existing database no longer break the API (D-403):
  boot reconciles the declarative schema before running the versioned migrations.
- Cut ordering, splitting and joining preserve work already done (D-575, D-576).
- Layout inheritance stays partial: a missing key means inherit, and defaults are
  materialized on read, never on write (RN-10).
- The renderer's browser download no longer aborts `dev.ps1` on a fresh install
  (D-671).
- Dozens of fixes across the shorts pipeline, stage, captions, covers and
  assisted upload — the areas this release exercises most.

### Removed
- Docker, `docker-compose.yml` and `bin/deploy` (D-674): they described the
  pre-multichannel data layout and never brought up the worker or the frontend.
- The `editado` cut status (D-665) and the legacy `/export` route.
- n8n as the AI path (D-344), dead Shorts v1 code (D-345), LosslessCut and
  auto-editor with their orphan endpoints (D-346, D-347).

### Security
- **The local API only answers this machine** (D-745). The backend listens on
  `127.0.0.1`, CORS allows local origins only, and a guard refuses
  state-changing requests, WebSockets and foreign `Host` headers (DNS
  rebinding). Before this, any page open in your browser could reach the API —
  which has no login. See [SECURITY.md](SECURITY.md).
- Private vulnerability reporting enabled, and a documented secret surface
  (D-675).

## [0.2.0] - 2026-07-06

### Added
- Configurações page: edit the channel identity, global render settings, and
  the mascot name directly from the app — configuration moved from files to a
  per-channel database with file mirror/fallback and boot migration (D-191, D-285).
- Update guard-rail now warns about **any** locally-modified tracked file before
  a production update, highlighting code outside `instance/` (D-178).

### Changed
- Internal: sliced seven oversized modules (>1300 lines) into cohesive
  sub-modules/sub-components following SRP, with the public façade preserved so
  behavior is unchanged — `ffmpeg_commands`, `pipeline_render`, `export`,
  `routers/cortes`, `CenaOverlay`, `YoutubeLayoutPanel`, `PostProductionPage` (E-006).
- Genericized residual mascot naming in renderer comments (D-259).

### Housekeeping
- The Guia Fluxo state (`.guia/`) is now developer-only; only `.guia/locks/`
  remains versioned (required by CI). The auditable action log is the git
  history itself (D-276).

## [0.1.0] - 2026-07-04

First public release.

### Added
- Core pipeline: YouTube livestream → download → transcribe → AI-proposed
  cuts → review/approve → metadata/thumbnails → export for YouTube.
- Layered final-render pipeline: cinematic grade via Intel QSV (FFmpeg) →
  selective transparent overlays (Remotion) → single-pass composition/encode.
- Segmented grade rendering in a memory-safe subprocess with freed threads (D-065).
- Per-cut and per-segment fine audio sync (offset) with live preview (F-063).
- Waveform/proxy warmup when a project is opened (F-062).
- Thumbnail prompt evaluation history to drive visual variation (D-066).
- Metadata access from the T / image icons in the cuts sidebar (D-068).
- "Not published" filter on the projects screen (F-059).
- Manual cut creation and YouTube URL parsing for manual publishing.
- Local image bank fallback for biography cards when the API has no match.

### Changed
- Render layered pipeline now runs the Remotion bundle in parallel with the
  GPU grade step, with a job-category worker queue.
- Skill routing reorganized by scope under `.guia/` (D-073).
- Process layout migrated to `.guia/`; the legacy `ai-process` pack was removed.

### Fixed
- Thumbnail headline no longer clips the title text (D-074).
- Exponential backoff for Claude CLI `529 Overloaded` responses (D-072).
- Cut generation uses the signed-in Claude session instead of the API key (D-071).
- Overlay chunks now use chunk-relative timing, fixing delayed/blank `.webm`
  chunks (see `docs/interno/historico-arquitetura-2026-05.md` §8).
- Single-flight audio proxy with hybrid seek (I-039).

[Unreleased]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Paulo-Marcos/gerador-cortes/releases/tag/v0.1.0
