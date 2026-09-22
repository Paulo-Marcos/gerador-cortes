# Fundos editoriais do Layout Compartilhado (extensão da F-020)

> **Status:** EM DESENVOLVIMENTO · documento vivo.
> **PROTOCOLO (regra do Paulo):** a cada avanço desta feature, ATUALIZE este doc
> (Estado atual + Histórico de avanços no fim), para retomar em qualquer chat.
> **Base:** continua a feature `F-020 — Cenas YouTube Full e compartilhada`.
> **Origem do design:** handoff Claude Design "Layout Backgrounds Final" (6 fundos: G, H, I, B, D, F).

Objetivo: trocar o fundo apático do layout compartilhado por **6 fundos editoriais
selecionáveis** (procedurais, CSS+SVG), com **moldura/brackets/placa de nome**, e
levar o fundo escolhido também para o **MP4 final** (FFmpeg).

---

## Estado atual

### Em andamento - cards em layout compartilhado
- Corrigir o default global **CARD: Vertical**: cenas com `layout_card: "auto"` passam a seguir o padrao global do projeto, mesmo em trechos compartilhados; apenas `layout_card: "horizontal"` explicito preserva horizontal.
- Em tela compartilhada, cards verticais devem usar a zona livre a esquerda da tela maior e acima da facecam, com escala proporcional do card/fonte para caber sem cobrir os videos.
- Ajuste fino: o encaixe lateral do card vertical foi deslocado 40px para cima, mantendo o tamanho do encaixe.
- Ajuste fino: a linha da moldura da imagem maior e a linha externa do palco foram reduzidas para `outlineScale=0.3`.
- Ajuste fino: a placa externa de nome/papel foi substituida por um degradê interno no rodape da facecam, liberando o espaço abaixo da imagem pequena.
- Ajuste fino: degradê interno da facecam ficou mais baixo, e o texto do papel/email foi aumentado para `13px` com menor espaçamento entre letras para melhorar leitura.

### Feito - presets de fonte dos cards/cenas
- Controle em **Filtros** para trocar a fonte padrao dos cards/cenas v2 por projeto.
- Opcoes: `Atual` (Space Grotesk + Source Serif), `Editorial` (Newsreader + Source Serif), `Classica` (Libre Baskerville) e `Humanista` (Merriweather + Newsreader).
- A escolha preserva cor, fundo, moldura e identidade visual; muda apenas as familias tipograficas usadas por `FONTS_V2`.
- A escolha afeta preview, Remotion Studio/Player e render final por overlays, via prop `fontPreset`.

### Feito — Preview (editor, Remotion Player)
- **6 fundos selecionáveis** na aba **Layout** (ordem G, H, I, B, D, F). Botão por modelo + descrição.
- **Brackets** só no palco (contorno externo), **molduras** chanfradas nas 2 imagens (recorte + contorno + sombra), **placa de nome** abaixo da facecam.
- Campos novos no contrato do layout: `fundo` (id) e `placa { nome, papel }`.
- **Default do `fundo`:** `hud-forte` (G). **Default da placa:** vazio (`Nome do Apresentador` / `contato@exemplo.com` como exemplo).
- **Fix de foco** da placa: digita atualizando só o estado local; preview sincroniza no `onBlur` (evita o cascade que roubava o foco a cada tecla).
- **Contorno externo:** brackets −20% (`bracketScale 0.36`, `bracketLen 62`); **linha** (clara + halo/sombra) mais fina (`outlineScale 0.5`). Molduras das imagens mantidas.

### Feito — Render final (MP4, FFmpeg)
- ✅ **Chrome completo no MP4** (Variante A): brackets, molduras chanfradas,
  sombra interna e placa de nome agora entram no MP4 via PNG do "palco" sobreposto
  aos vídeos. Ver seção "Avaliação de arquitetura → Implementado".
- O **fundo** escolhido entra no MP4: quando há palco, o fundo vem dentro dele;
  senão, 6 PNGs 1920×1080 em `backend/assets/youtube_bg/<fundo>.png` (`-loop 1 -i`
  + `split` por região) como antes.
- **Fallback seguro:** sem palco e sem fundo-PNG, cai no `drawbox` antigo.
- Resolução do PNG (fundo e palco) é feita dentro do `ffmpeg_commands.py` →
  **não precisou tocar no `pipeline_render.py` (travado)**. A GERAÇÃO do palco
  fica no service `youtube_palco.py`, disparada no save do layout (`projetos.py`).
- Filtergraph (fundo e palco) validado com ffmpeg real (libx264) — render
  1920×1080 OK.

### Explicado — "palco" (item C, pendente de decisão)
O "palco" é a camada escura que entra **atrás de um card** quando ele aparece (escurece o vídeo p/ o card saltar). Hoje usa o fundo editorial escolhido. Decisão em aberto: manter assim ou trocar por escurecimento liso atrás dos cards.

---

## Pendências (próximos passos)
1. ✅ **Chrome/molduras/placa no MP4 final** — RESOLVIDO via Variante A (PNG do
   "palco" por cima dos vídeos). Caminho project-default pronto. Restam apenas os
   itens em "Pendências da Variante A" (override por-corte, perf, registro, QSV) —
   ver seção "Avaliação de arquitetura".
2. **Decisão do "palco"** (item C): fundo editorial vs. escurecimento liso atrás dos cards.
3. **12 testes pré-existentes** quebrados em `tests/services/test_cenas_validacao.py` e `tests/routers/test_export_status_cenas.py` — causa: `_corte_to_dict` (cortes.py:196) faz `json.loads` num `MagicMock` dos testes. **Não é desta extensão** (cortes.py é travado e não foi tocado); fica registrado p/ tratar com desbloqueio.
4. **Validar render real** num corte em modo Compartilhada na máquina com QSV (o filtergraph foi validado com libx264; o encoder não muda a lógica do filtro).

---

## Avaliação de arquitetura — Chrome no MP4 final (2026-05-29) · ✅ VARIANTE A IMPLEMENTADA

> Sessão Paulo x Claude. Paulo escolheu **A**. Spike validado com PNG + render
> real; implementação do caminho project-default concluída. Pendências de
> per-corte + perf abaixo. (Análise original mantida como registro.)

### ✅ Implementado (Variante A)
- **Still do palco** (`video-renderer/src/youtube-bg/palco-entry.tsx`, composição
  `YoutubePalco`): rasteriza fundo + chrome + molduras + placa 1920×1080 com as
  **2 janelas de vídeo transparentes**. Técnica do "furo": `<mask>` SVG branco
  com as 2 formas de chanfro pretas corta o fundo opaco; **caster preto** (corpo
  recortado, sombra preservada) projeta o drop-shadow no fundo. Sombra interna e
  degradê da placa ficam em **alpha parcial** sobre a janela.
- **Validação do PNG (alpha sondado):** centro das janelas `alpha=0`; sombra
  interna `alpha≈34`; placa `alpha≈245`; fundo/brackets `alpha=255`. ✔
- **FFmpeg** (`ffmpeg_commands.py`, não travado): `_resolve_shared_fg_png(layout)`
  acha o PNG por hash; quando existe, o palco entra como input em loop e é
  sobreposto **POR CIMA** dos vídeos (base preta sob os vídeos, palco opaco cobre
  o resto e mascara os cantos retos). Dispensa o fundo-embaixo. Sem palco → cai
  no fundo-PNG/`drawbox` (legado intacto). De-riscado com ffmpeg real (libx264):
  vídeo aparece pelas janelas chanfradas, chrome/placa por cima. ✔
- **Chave de cache pura** `palco_cache_key(layout)` (`youtube_layout.py`):
  `sha1(versão-chrome + fundo + placa + geometria)[:16]`. Backend é dono da chave
  e do caminho; o Node só recebe o caminho de saída (sem hash cross-language).
- **Geração** (`services/youtube_palco.py` + `scripts/gen-youtube-palco.mjs`):
  `ensure_palco_png(layout)` gera via `remotion still` se faltar (idempotente +
  dedupe de concorrentes). Disparado **fire-and-forget ao salvar o layout padrão**
  (`routers/projetos.py` PATCH `/render-config`, não travado). Fallback de
  subprocess p/ Windows.
- **Cache** em `backend/projetos/_palco_cache/<hash>.png` — já gitignored por
  `backend/projetos/*` + persistente, **sem tocar no `.gitignore` (travado)**.

### Como gerar/regenerar o palco
```bash
# default (props embutidas) p/ inspeção rápida → .tmp/palco-test.png
node scripts/gen-youtube-palco.mjs
# layout específico: caminho de saída + props JSON {fundo,placa,crop_*,slot_*}
node scripts/gen-youtube-palco.mjs <out.png> <props.json>
```
Em produção o backend gera sozinho ao salvar o layout. **Bump `PALCO_CHROME_VERSION`
(`youtube_layout.py`) quando mudar o visual do chrome** → invalida o cache.

### Pendências da Variante A
1. **Override por-corte:** o gatilho de geração está no save do layout **padrão**
   (`projetos.py`). Cortes que mudam placa/slots via `cortes.py` (TRAVADO) não
   pré-geram o palco → caem no fallback de fundo. Próximo: endpoint não-travado
   "ensure palco" chamado pelo front ao salvar override, ou geração lazy.
2. **Perf:** cada geração faz bundle completo do Remotion (`npx remotion still`,
   ~30-60s). Trocar por `@remotion/renderer.renderStill` com bundle reaproveitado
   (o `native_worker` já tem Remotion) e/ou debounce.
3. **Registro sub-pixel:** validar em corte real que não há fresta na borda
   janela×vídeo (mitigação: overscan ~2px + teste canário das contas de escala).
4. **Validar render real com QSV** (de-risk foi com libx264).

---

### Análise original (registro) — DECISÃO: A

> Recomendação: **A**.

**Causa raiz confirmada (por que brackets/linhas somem no MP4):** o filtergraph
`build_cinematic_grade_layout_filter` empilha `[fundo PNG] → overlay tela → overlay face`
(`backend/app/domain/ffmpeg_commands.py`). O **fundo entra POR BAIXO** dos vídeos (por isso
aparece nas margens), mas todo o "chrome" (brackets, linhas, molduras chanfradas, sombras,
placa) vive só em `frontend/.../youtubeChrome.tsx` e **nunca é rasterizado para o FFmpeg**.

**Proposta avaliada (PNG "tudo-em-um" por cima dos vídeos):** sólida, com 2 correções:
- **Janelas NÃO são alpha=0.** Elas carregam **alpha parcial** que precisa sobreviver: a
  **sombra interna** (`inset 0 0 60px`) e o **degradê da placa** no rodapé da facecam. Salvar
  PNG em 8-bit alpha; não achatar para 0/255. O `overlay` do FFmpeg faz straight-alpha → ok.
- **O still do "palco" ainda não existe.** `youtube-bg/still-entry.tsx` rasteriza só
  `YoutubeBackground`. O chrome precisa ser **portado/espelhado para `video-renderer/`**
  (mesma duplicação intencional já aceita p/ os fundos).

**Duas variantes:**
- **A — Frente única (proposta do Paulo) [RECOMENDADA]:** vídeo retangular embaixo; 1 PNG
  (fundo+chrome+placa, janelas chanfradas com alpha parcial) por cima; cantos retos mascarados
  pelo fundo opaco do PNG. FFmpeg trivial (1 overlay). Não reusa os 6 PNGs de fundo (o still
  por projeto refunde o fundo). ⚠️ Furar janelas transparentes num fundo opaco exige **`mask`
  SVG/CSS única** (não dá com divs separados/CSS comum) — fazer um spike antes de cravar.
- **B — Fundo embaixo + vídeo recortado + chrome em cima:** reusa os 6 PNGs; recorta o vídeo
  no chanfro via **máscara alpha** no FFmpeg; chrome esparso por cima. Mais peças, exige
  alinhar a máscara ao crop/scale do FFmpeg.

**Pontos cegos gráficos (blending):**
1. Alpha parcial (sombra interna + placa) — não achatar.
2. **Registro sub-pixel** janela×vídeo: `_proportional_size` (Python int round) vs
   `renderedSize` (TS float) podem divergir 1px → fresta. Mitigar com **overscan ~2px** do
   vídeo sob a linha do chrome + **teste canário cross-language** das contas de escala.
3. Fringing/premultiplied: manter blend em `rgba` e só depois `format=nv12` (já é assim).
4. Cor/gamma: fundo+chrome casam (ambos Chromium), mas o **grade só afeta o vídeo** → tom
   final ≠ preview (já é verdade hoje).
5. Nada de `mixBlendMode` na camada de chrome (FFmpeg não replica blend-com-backdrop).

**Gargalos de cache:**
1. **Chave** = `hash(geometria normalizada + placa + fundo + versão-do-chrome)`. Keyar só por
   id de projeto serve PNG velho ao mexer no layout. `versão-do-chrome` invalida em mudança de JSX.
2. **Cold boot do Chromium:** `gen-youtube-bg.mjs` dá 1 `npx` por fundo (6 boots); por-corte
   seria tortura. Usar `@remotion/renderer.renderStill` com **bundle reaproveitado** (o
   `native_worker` já tem Remotion) e gerar **eager ao salvar o layout**, não no render.
3. **Storm por-corte:** gerar N stills numa só passada de Remotion (várias props), não 1 processo por still.
4. **ARQUIVO TRAVADO:** gerar PNG é efeito colateral e não pode morar no domínio puro; o seam
   natural (`_executar_grade`→`pipeline_render.py`) está **travado**. Saída sem destravar:
   replicar o truque do fundo — `ffmpeg_commands._resolve_shared_fg_png(layout)` só **acha o
   PNG por hash** (igual a `_resolve_shared_bg_png`, não-travado); a **geração** acontece eager
   no endpoint de salvar layout (`routers/projetos.py`, fora dos locks). Override por-corte
   (`cortes.py` travado) → gerar lazy num service não-travado fora dele.

---

## Mapa de arquivos

### Criados
- `frontend/src/features/editor/fase2/youtubeBackgrounds.tsx` — 6 fundos + `YOUTUBE_BACKGROUND_OPTIONS` + dispatcher `YoutubeBackground`.
- `frontend/src/features/editor/fase2/youtubeChrome.tsx` — `buildChromePaths`, `CardChrome`, `chromeClipPath`, `ImageFrame`, `NamePlate`, `StageChrome`.
- `video-renderer/src/youtube-bg/backgrounds.tsx` — **espelho** (React 19) dos fundos p/ rasterizar PNG.
- `video-renderer/src/youtube-bg/still-entry.tsx` — entry isolado p/ `remotion still` (não toca no `Root.tsx`).
- `scripts/gen-youtube-bg.mjs` — gera os 6 PNGs.
- `backend/assets/youtube_bg/<fundo>.png` — 6 PNGs 1920×1080 (assets).
- `video-renderer/src/cenas-v2/_shared/font-preset-context.tsx` — provider de variáveis CSS para trocar as fontes v2 sem alterar cena por cena.
- **[Variante A] `video-renderer/src/youtube-bg/chrome.tsx`** — espelho (React 19) da geometria + chrome do frontend (`buildChromePaths`, `chromeClipPath`, `CardChrome`, `SpeakerLabel`, `StageChrome`, `SlotBox`, `renderedSize`).
- **[Variante A] `video-renderer/src/youtube-bg/palco-entry.tsx`** — composição `YoutubePalco` p/ `remotion still`: fundo+chrome+placa com janelas transparentes (mask SVG + caster do drop-shadow).
- **[Variante A] `scripts/gen-youtube-palco.mjs`** — rasteriza o palco (out + props opcionais).
- **[Variante A] `backend/app/services/youtube_palco.py`** — `ensure_palco_png` (gera via still, idempotente + dedupe) + `palco_png_path`.
- **[Variante A] `backend/projetos/_palco_cache/<hash>.png`** — cache por layout (já gitignored por `backend/projetos/*`).

### Alterados
- `frontend/src/features/editor/fase2/youtubeLayout.ts` — contrato `fundo` + `placa`, defaults, normalize.
- `frontend/src/features/editor/fase2/CenasRemotionPreview.tsx` — render do fundo + chrome + molduras + placa no `SharedVideoLayout`.
- `frontend/src/features/editor/fase2/YoutubeLayoutPanel.tsx` — seletor de fundo + inputs da placa + fix de foco.
- `backend/app/domain/ffmpeg_commands.py` — fundo PNG no grade (loop+split) + fallback + `_resolve_shared_bg_png`. **[Variante A]** `_resolve_shared_fg_png` (palco por hash), `fg_input` no filtergraph (palco POR CIMA + base preta), `_shared_foreground_png_chain`/`_shared_black_base_chain`.
- `backend/app/domain/youtube_layout.py` — normalize/defaults de `fundo` e `placa`. **[Variante A]** `palco_cache_key` + `PALCO_CHROME_VERSION`.
- `backend/app/routers/projetos.py` — **[Variante A]** dispara `ensure_palco_png` (fire-and-forget) ao salvar `layout_youtube_padrao`.
- `backend/tests/domain/test_youtube_layout.py`, `backend/tests/domain/test_ffmpeg_commands.py` — testes novos (incl. **[Variante A]** `TestPalcoCacheKey` + testes do `fg_input`/palco por cima).
- _Nota:_ o cache fica em `backend/projetos/_palco_cache/` (já ignorado) — **`.gitignore` é travado e NÃO foi tocado**.
- Presets de fonte: `fonte_preset` em `Projeto` (`models.py`/`database.py`/`routers/projetos.py`), props extras em `pipeline_render.py` e `routers/cortes.py`, tipos/API em `frontend/src/types/models.ts` e `frontend/src/lib/api.ts`, seletor em `EditorFase2/Filtros`, prop no `CenaPlayerPanel`/`CenasRemotionPreview`, schema/tema/provider no Remotion v2 (`theme-v2.ts`, `schema.ts`, `overlay-schema.ts`, `Root.tsx`, `CenaYouTubeV2.tsx`, `OverlaySceneV2.tsx`, `OverlayTimelineV2.tsx`, `_shared/index.ts`).

### Travados — NÃO tocados (de propósito)
- `frontend/.../EditorFase2.tsx` — já passa o layout inteiro p/ preview e painel; fix de foco foi feito no painel.
- `backend/app/routers/cortes.py` — já faz round-trip do `layout_youtube` pelo normalize.
- `backend/app/services/pipeline_render.py` — chama `build_cinematic_grade_cmd`, que resolve o PNG sozinho.
- `video-renderer/src/cenas-v2/*`, `schema.ts`, `package.json`, `Root.tsx` — por isso o still usa entry dedicado.

---

## Contrato (campos novos em `layout_youtube`)
```jsonc
{
  "fundo": "hud-forte",            // hud-forte|topo-estrutural|hud-topo|architectural-hud|topographic|cosmograph
  "placa": { "nome": "Nome do Apresentador", "papel": "contato@exemplo.com" }
}
```
- `fundo` inválido/ausente → `hud-forte`.
- `placa` ausente → default vazio; strings vazias explícitas são preservadas (permite limpar).

| id | letra | nome |
|----|-------|------|
| hud-forte | G | HUD Forte |
| topo-estrutural | H | Topo Estrutural |
| hud-topo | I | HUD + Topo |
| architectural-hud | B | Architectural HUD |
| topographic | D | Topographic |
| cosmograph | F | Cosmograph |

---

## Como regenerar os PNGs
Os fundos são estáticos (não dependem do corte). Após mudar `video-renderer/src/youtube-bg/backgrounds.tsx`:
```bash
node scripts/gen-youtube-bg.mjs
# saída: backend/assets/youtube_bg/<fundo>.png (6x, 1920x1080)
```
> Os componentes do frontend (`youtubeBackgrounds.tsx`) e do video-renderer (`youtube-bg/backgrounds.tsx`) são **espelhos** — mantenha os visuais em sincronia (duplicação intencional: o video-renderer é React 19 e roda o still headless).

---

## Decisões técnicas
- **Fundos estáticos → PNG pré-gerado** (não render por corte) → FFmpeg só escolhe pelo `fundo`. Barato e sem tocar pipeline travado.
- **Fallback drawbox** se o PNG faltar → zero risco de quebrar render.
- **Fix de foco da placa:** digitar dispara só `setDraft` local; `setQueryData` (que re-renderiza EditorFase2 + Player) só no `onBlur`.
- **Contorno externo:** brackets reduzidos −20% (`bracketScale 0.36`, `bracketLen 62`); linha do contorno (clara + ghost/halo) afinada via `outlineScale 0.5` (era 0.8) — só a grossura da linha, brackets e geometria mantidos. A linha interna do `CardChrome` também escala por `outlineScale` (molduras com `outlineScale=1` ficam iguais).
- **Presets de fonte via CSS variables:** `FONTS_V2.display/serif/serifItalic/mono` agora usam `var(--font-*-v2, fallback)`; o `FontPresetProvider` define as variáveis no topo da composição. Isso evita refatorar todos os cards e mantém fallback visual se a prop não vier.

## Verificações já rodadas
- `pytest tests/domain/test_youtube_layout.py tests/domain/test_ffmpeg_commands.py` — verde.
- `pytest tests/services/test_pipeline_render.py` — verde (126).
- Frontend `eslint` + `tsc` + `build` — verde.
- De-risk ffmpeg real (libx264 + PNG) — render 1920×1080 OK.
- `npm run build` em `frontend/` — verde após o seletor de fontes.
- `npm run build` em `video-renderer/` — verde após `FontPresetProvider`/schemas.
- `npx eslint` direcionado nos arquivos alterados de frontend e video-renderer — verde.
- `pytest backend/tests/services/test_pipeline_render.py -q` — 126 testes verdes após `fontPreset` no pipeline.
- `npm run test:cards` em `video-renderer/` — 36 stills verdes após presets.

---

## Histórico de avanços
- **2026-05-29** — Extensão criada: 6 fundos selecionáveis + seletor na aba Layout; campo `fundo` (front+back); preview renderiza o fundo escolhido (compartilhada + palco).
- **2026-05-29** — Chrome (brackets) no palco, molduras nas 2 imagens e placa de nome no preview; campo `placa{nome,papel}` + inputs.
- **2026-05-29** — Fundo no MP4 final via PNG pré-gerado (FFmpeg `-loop`+`split`, fallback `drawbox`); 6 PNGs em `backend/assets/youtube_bg/`; still em `video-renderer/src/youtube-bg/` + `scripts/gen-youtube-bg.mjs`. Filtergraph de-riscado.
- **2026-05-29** — Ajustes: fix de foco da placa (digita local, sync no `onBlur`); default placa vazio (ex.: `Nome do Apresentador` / `contato@exemplo.com`); contorno externo −20% (linha + brackets).
- **2026-05-29** — Linha do contorno externo afinada (só a grossura): `outlineScale 0.8 → 0.5`. Brackets e geometria mantidos.
- **2026-05-29** — Edição de tempo dos intervalos (aba Layout) corrigida: campos início/fim agora são **mm:ss** com buffer local (`TimeField`), confirmando no blur/Enter — acaba o roubo de foco/reparse a cada tecla. `commit*` mantém o intervalo válido (início<fim, dentro de [0, duração]). Aceita `mm:ss`, `hh:mm:ss` ou segundos puros.
- **2026-05-29** — _Nota:_ a feature evoluiu **em paralelo (outro chat)**: `CenasRemotionPreview`/`youtubeChrome` ganharam `SpeakerLabelOverlay`, `SharedCardZoneFrame`, `sharedVerticalCardZone`, `fontPreset`. Este doc cobre o que passou por aqui; confira os arquivos para o estado exato desses pontos.

### Pendências de UX conhecidas
- Os inputs numéricos do `SharedRectEditor` (x/y/w/h/escala) têm o MESMO padrão `onChange→patch` (foco/reparse). Aplicar o mesmo buffer-no-blur do `TimeField`/placa quando incomodar.
- **2026-05-29** — Iniciada continuacao: `layout_card: "auto"` passa a respeitar o default global, e cards verticais em compartilhada ganham zona lateral esquerda com escala proporcional.
- **2026-05-29** — Implementados presets de fonte por projeto: seletor em Filtros, persistencia `fonte_preset`, preview/Studio/render v2 via `fontPreset`, e provider por CSS variables para trocar `display/serif/italic/mono` sem alterar cena por cena.
- **2026-05-29** — Sessão de análise (chrome no MP4): causa raiz confirmada (fundo entra por baixo; chrome só existe no frontend e nunca é rasterizado p/ FFmpeg). Avaliada a proposta do PNG "tudo-em-um" — viável com 2 correções (janelas têm alpha PARCIAL; still do palco ainda não existe, precisa portar chrome p/ video-renderer). Documentadas variantes A (frente única, recomendada) vs B (vídeo recortado), pontos cegos de blending e gargalos de cache (incl. seam sem tocar `pipeline_render.py` travado). Ver seção "Avaliação de arquitetura". **DECISÃO A vs B pendente.**
- **2026-05-29** — ✅ **Variante A implementada** (Paulo escolheu A). Chrome (brackets/molduras/sombra/placa) agora vai ao MP4: still `YoutubePalco` (chrome.tsx + palco-entry.tsx) rasteriza o palco com janelas transparentes (mask SVG + caster do drop-shadow). Alpha sondado OK (janela=0, sombra interna≈34, placa≈245, fundo=255). FFmpeg: `_resolve_shared_fg_png` + `fg_input` sobrepõe o palco por cima dos vídeos (base preta), dispensa o fundo-embaixo, fallback intacto; de-riscado com ffmpeg real (libx264) — vídeo aparece pelas janelas chanfradas. Chave `palco_cache_key` + geração `ensure_palco_png` (still, dedupe) disparada no save do layout (`projetos.py`); cache em `backend/projetos/_palco_cache/` (já gitignored, sem tocar no `.gitignore` travado). Testes: 123 domínio + 126 pipeline verdes; tsc do video-renderer limpo. Pendências: override por-corte, perf (bundle reaproveitado), registro sub-pixel, render real QSV.
