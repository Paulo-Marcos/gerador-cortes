# Render Pipeline e Timeline Editor

Indice de navegacao para renderizacao de cortes, overlays Remotion, Native Worker e botoes do editor.

## Pipeline Oficial (unico)

O render final usa composicao por camadas — esta e a unica pipeline suportada:

1. `clip_raw.mkv` ou `clip_raw.mp4`
2. `graded/clip_graded.mp4` (FFmpeg QSV — grade rapida)
3. `overlays/_remotion_bundle/` (bundle unico reaproveitado)
4. `overlays/chunk_*.mov` (Remotion `OverlayTimeline`, ProRes 4444 com alpha)
5. `temp/clip_composed.mp4` (FFmpeg compoe chunks sobre o video tratado)
6. `upload_ready/video.mp4` (encode final YouTube-ready)

> Os arquivos antigos `overlays/ov_*.mov` (um overlay por cena) ainda sao aceitos como fallback durante a composicao para projetos legados. Renders novos sempre produzem `chunk_*.mov`.

## Arquivos-Chave

- Backend orchestration: `backend/app/services/pipeline_render.py`
- FFmpeg builders: `backend/app/domain/ffmpeg_commands.py`
- Endpoint do pipeline: `backend/app/routers/cortes.py`
- Service de entrada do render: `backend/app/services/remotion_render.py`
- Frontend Angular (legado): `frontend/src/app/pages/timeline-editor/timeline-editor.component.ts`
- Frontend (React): `frontend/src/features/final-review/FinalReviewPage.tsx`, `frontend/src/features/post-production/ScenesPostProductionPage.tsx`
- Remotion overlay isolado: `video-renderer/src/OverlayScene.tsx`
- Remotion overlay em chunks: `video-renderer/src/OverlayTimeline.tsx`
- Registro das compositions: `video-renderer/src/Root.tsx`
- Native Worker: `video-renderer/native_worker.js`

## Endpoints Relevantes

- `GET /api/cortes/{corte_id}/pipeline-status`
  - Retorna quais fases ja tem artefatos em disco.
  - Usado pelo modal antes de renderizar.

- `POST /api/cortes/{corte_id}/renderizar-pipeline`
  - Body: `{ filtro, continuar, start_from }`
  - `start_from`: `auto`, `grade`, `overlays`, `compose`, `encode`.
  - **Unico endpoint de render final**. Os antigos `/renderizar-remotion` e `/renderizar-remotion-apenas` foram removidos.

- `POST /api/cortes/{corte_id}/gerar-bruto`
  - Gera somente o bruto do corte informado. O frontend captura o `corteId` no clique.

## Pipelines removidos (nao usar)

Os caminhos abaixo foram removidos do codigo. **Nao reintroduzir.**

- `RemotionRenderService.renderizar_video_final` — pipeline pesado que renderizava o video inteiro dentro do Remotion (`CenaYouTube`). Substituido pelo pipeline por chunks.
- `ExportService.processar_clip_remotion` — variante orfa do mesmo conceito.
- Parametros `apenas_remotion` e `pipeline_otimizado` em `iniciar_render_background`. A funcao agora chama sempre `renderizar_pipeline_otimizado`.

## Decisoes Recentes

- **Overlay preto no FFmpeg**:
  - Render de overlay usa ProRes com alpha: `--codec=prores`, `--prores-profile=4444`, `--image-format=png`, `--pixel-format=yuva444p10le`, `--gl=angle`, `--log=warn`, `--concurrency 1`.
  - Native Worker reescreve `npx remotion ...` para Node direto com `--max-old-space-size=8192`.
  - Composicao FFmpeg converte base e overlays para `rgba`, depois fecha em `nv12`.

- **Otimizacao por chunks**:
  - Em vez de renderizar `ov_001.mov`, `ov_002.mov` ... um por cena (cada um pagando custo de bundle), o pipeline cria `overlays/_remotion_bundle` uma vez e renderiza `chunk_001.mov`, `chunk_002.mov` agrupando cenas proximas.
  - Composition: `OverlayTimeline` (mini-timeline com `Sequence` por cena, `FrameOffsetContext` preserva animacao local).

- **Modal de retomada**:
  - O antigo `confirm()` do botao de render final nao deve voltar.
  - O frontend consulta `pipeline-status`.
  - Se houver fase concluida, mostra modal com ponto de partida.
  - Se nao houver fase concluida, inicia direto em `grade`.
  - `start_from` deve controlar quais fases sao preservadas. Nao use `continuar=false` como motivo para rerodar fases anteriores.

- **Fase 1 rapida**:
  - Filtro rapido: `eq` + letterbox, audio `aresample`, QSV `veryfast`, `global_quality=27`.
  - Timeout longo (4h) para cortes grandes.

## Artefatos de Disco por Fase

- Raw: `clip_raw.mkv` ou `clip_raw.mp4`
- Grade: `graded/clip_graded.mp4`
- Bundle Remotion: `overlays/_remotion_bundle/index.html`
- Overlays: `overlays/chunk_*.mov` (preferencial) ou `overlays/ov_*.mov` (legado)
- Composicao: `temp/clip_composed.mp4`
- Final: `upload_ready/video.mp4`

## Onde Investigar Problemas

Ver [Troubleshooting → Render Pipeline](../TROUBLESHOOTING.md#render-pipeline-remotion--native-worker)
para tela preta no overlay, pipeline pulando etapa indevida e worker lento/Exit 134.
