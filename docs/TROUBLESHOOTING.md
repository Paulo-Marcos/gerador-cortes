# Troubleshooting — CortadorLive

Problemas conhecidos de operação/instalação e onde investigar, consolidados a partir do
[SETUP.md](SETUP.md) e do [render-pipeline.md](ai-index/render-pipeline.md).

---

## Setup / Instalação

### Chrome Headless Shell do Remotion não extrai (Node 24)

No Node 24 o `extract-zip` do Remotion extrai apenas ABOUT + LICENSE do zip do Chrome Headless
Shell, em silêncio. Sem o binário, todo render "conclui" com exit 0 mas **não gera arquivo**.

Rode o script idempotente abaixo (a partir da raiz do repo) sempre após instalar as dependências
do `video-renderer` (`npm install`/`npm ci`):

```powershell
powershell -File bin/ensure-remotion-browser.ps1
```

Ele detecta o exe já presente (nada a fazer), ou extrai o zip com `Expand-Archive` e cria o marker
`VERSION` para o Remotion aceitar o browser local sem re-baixar.

---

## Render Pipeline (Remotion + Native Worker)

### Tela preta no overlay

- Verificar codec/profile dos `chunk_*.mov`.
- Verificar filter graph em `build_overlay_filter_string()`.

### Pipeline pulando etapa indevida

- Verificar `pipeline-status`.
- Verificar `_limpar_a_partir_de()` em `pipeline_render.py`.
- `_validar_video_completo()` não deve reprovar MP4 grande apenas porque `ffprobe` não retornou
  `duration`; bloquear somente arquivo pequeno ou erro claro como `moov atom not found`.

### Worker lento ou Exit 134

- Exit code `134` normalmente indica crash Node/Chromium por encoder/GPU/heap nativo.
- Antes de trocar codec, conferir se o comando preserva: ProRes 4444 + PNG + `yuva444p10le` +
  `--gl=angle` + `--log=warn` + `--concurrency 1`.
- Se travar em `Bundling 6%`, limpar caches regeneráveis: `video-renderer/build`,
  `video-renderer/node_modules/.cache`, `video-renderer/node_modules/.remotion`.
- Paralelismo de overlays: `REMOTION_OVERLAY_PARALLEL` (default 2). O Python também dispara
  overlays em batch — `_MAX_OVERLAYS_PARALLEL` em `pipeline_render.py` deve casar com esse valor.

Mais contexto de arquitetura do pipeline em [render-pipeline.md](ai-index/render-pipeline.md).
