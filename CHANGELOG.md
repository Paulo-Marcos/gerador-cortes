# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Architectural deep-dives that predate this file are preserved as historical
> narrative in [`docs/CHANGELOG.md`](docs/CHANGELOG.md). New changes are tracked
> here in the standardized Keep a Changelog format.

## [Unreleased]

### Added
- Editorial v2 for cut analysis (D-302): the cutter skill now proposes cuts as
  self-sufficient stories — strongest-entry-point hook (`frase_gancho`), short
  opening contextualization, hook/flow/value priority score, 5/8–18/30-minute
  duration bands, diarization-aware rules, 55–60-character titles — and the
  trechos skill becomes a "cohesion editor" with the power to revise (remove or
  adjust) desvios previously marked by AI. New `Corte`/`CorteSnapshot` columns
  persist the v2 proposal (schema migration 004, tolerant of pre-v2 outputs).
- Editorial telemetry (D-303): the AI's cut proposal is frozen as an immutable
  snapshot at import time; new endpoints compare proposal vs. final edited cut
  per project and cross-project (JSON/CSV) — boundary deltas, kept/removed/added
  desvios by origin, title changes. Manually-created cuts are labeled
  `sem_proposta_ia` and pre-telemetry cuts `sem_snapshot`.
- Current playback speed is shown on the raw-editing timeline bar again (D-402):
  the workbench header carries the read-only `⚡ N.NN×` pill next to the ⚙ menu,
  so the review pace is legible without opening a menu. Changing speed (⚙ menu
  or Ctrl+J/K) updates it live; the control itself stays in the menu.

### Changed
- Grade renders with a palco are ~16% faster (D-415): the static palco is now
  pre-composed offline into an opaque background (black base + palco flattened)
  plus a slot-masked chrome cutout, letting the main filtergraph chain run in
  yuv420p — eliminating the full-frame RGBA conversions and the full-frame
  palco overlay that dominated the composite cost (D-329). Derived assets are
  cached next to the palco PNG and invalidated by palco mtime/slot geometry;
  any derivation failure falls back to the legacy graph, and
  `GRADE_PALCO_PRECOMPOSTO=0` disables the optimization entirely.
- The 30% ceiling on removed desvios is gone: removal is now governed by a
  semantic guardrail (the argument's logical chain must survive the removals),
  with quality controlled by telemetry instead of a quota (D-302).

### Fixed
- Model columns missing from an existing database no longer break the API
  (D-403). `create_all` only creates tables that do not exist yet, so a column
  added to a model whose table was already in the user's database never reached
  it — `metadados_cortes.is_fire` was in that state and made
  `GET /api/cortes/projeto/{id}` and `/api/export/projeto/{id}/status` fail with
  500 (`no such column`), leaving the UI claiming the project had no cuts. Boot
  now reconciles the declarative schema before running the versioned migrations:
  the missing `ALTER TABLE ADD COLUMN` statements are derived from
  `Base.metadata`, so forgetting one is no longer possible. The repair is
  conservative — it only adds columns declared in the model, never drops or
  renames, does not reproduce constraints, and logs each repair as a warning.

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
  chunks (see `docs/CHANGELOG.md` §8).
- Single-flight audio proxy with hybrid seek (I-039).

[Unreleased]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Paulo-Marcos/gerador-cortes/releases/tag/v0.1.0
