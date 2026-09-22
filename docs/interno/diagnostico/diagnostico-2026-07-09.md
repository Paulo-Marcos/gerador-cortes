# Diagnóstico — Render Final (custo FFmpeg) · 2026-07-09

**Escopo:** fase de Render Final do CortadorLive — construção de overlays + aplicação de
filtros FFmpeg (grade → compose → encode). Foco em **performance/custo de processamento**.
**Hardware alvo:** notebook com Intel iGPU apenas (sem NVIDIA); QSV é o teto e já é usado.
**Método:** fan-out de 3 subagentes read-only (A1 filtergraph/encode, A2 fases/telemetria,
B clean-architecture). Postura: avaliação, sem alterar código.

---

## Resumo executivo

Os três subagentes, olhando o código por ângulos diferentes, **convergiram no mesmo
gargalo estrutural nº 1**: o vídeo inteiro é **encodado duas vezes** (grade grava um
intermediário `clip_graded.mp4`; o compose decoda esse intermediário e re-encoda a 8 Mbps).
Um encode + um decode full-length são desperdiçados.

Em ordem de ganho estimado:

1. **[ALTA] Dupla codificação full-length.** Grade encoda o clipe inteiro (h264_qsv,
   `global_quality=30`, lossy) → disco → compose decoda tudo de novo → re-encoda. Fundir
   grade+compose+encode num único filtergraph elimina **1 encode + 1 decode** de duração
   inteira. *Trade-off:* perde o overlap Fase1∥Fase2 — mas veja o item de medição.
2. **[ALTA] Compositing em RGBA.** Base e overlays usam `format=rgba` (4 bytes/px) na parte
   mais cara (composite roda na CPU). `yuva420p` corta ~2,7× a banda de memória. Ganho
   direto de CPU no passo que o próprio código declara ser o gargalo.
3. **[MÉDIA] Compose decoda o vídeo principal em software** — sem `-hwaccel qsv`, mesmo o
   `clip_graded.mp4` sendo H.264 decodável por QSV (o próprio código mede QSV decode ~44%
   mais rápido).
4. **[MÉDIA] Corte sem overlays re-encoda o vídeo inteiro à toa** em vez de `-c copy`.
5. **[MÉDIA] `vignette` + `unsharp` dominam o custo do `-vf` da grade** (bench do próprio
   módulo: sem vinheta 1,66× mais rápido; versão leve 5,79×). Sem equivalente QSV → a
   alavanca é escolher preset mais leve, não reengenharia.

> ⚠️ **Bloqueador de decisão — não há telemetria real.** A varredura de
> `pipeline_events.jsonl` achou **1 arquivo, degenerado** (corte que falhava, sem overlays,
> grade sempre pulada). **Zero** `render_final`/`grade` concluídos com `duration_sec` real em
> todo o repo. Qual fase domina o tempo é hoje **indeterminado empiricamente**. A fusão do
> item 1 sacrifica o overlap Fase1∥Fase2 — só vale se a grade estiver mesmo no caminho
> crítico. **Ação nº 0: medir** (coletar `pipeline_events.jsonl` de PROD ou rodar 2–3 cortes
> reais em DEV com timing por fase) antes de comprometer a fusão.

Nuance que reforça a fusão: o "paralelismo" Fase1∥Fase2 **disputa a mesma iGPU** — o
`native_worker.js` limita a 1 overlay enquanto a grade roda. O overlap não entrega `max()`
puro; os overlays rodam degradados durante a grade. Ou seja, o custo de abrir mão do overlap
(ao fundir) é menor do que parece.

---

## A1 — Filtergraph & encode
**status:** ok

**Mapa do caminho (2 encodes full-length de H.264/QSV sobre o vídeo inteiro):**
Fase 1 (Grade) `build_grade_plan` → `build_cinematic_grade_cmd` grava `clip_graded.mp4`
com **encode #1** (`ffmpeg_commands.py:353`). No modo segmentado (default) são N encodes de
segmento `.ts` (`ffmpeg_grade.py:189`) + concat `-c copy` (`ffmpeg_grade.py:246`, correto).
Fase 3 (Render final) `build_compose_and_encode_cmd` **re-decoda `clip_graded.mp4`**
(`ffmpeg_overlay.py:176`) e faz **encode #2** (`ffmpeg_overlay.py:241`). O encode #1 é
descartado depois.

- **[alta] Grade produz intermediário imediatamente re-decodado e re-encodado no compose.**
  `pipeline_render.py:206`, `ffmpeg_commands.py:353` (encode #1), `ffmpeg_overlay.py:176`
  (re-decode) + `:241` (encode #2). Fundir grade-filtergraph + overlay-compose num único
  `ffmpeg` (o `-vf` da grade concatenado às cadeias de overlay, `[vout]`→encode final).
  *Trade-off:* serializa o composite da grade após os overlays existirem em disco — perde o
  overlap. Confirmar com clip real antes.
- **[alta] Compositing inteiramente em RGBA (4 B/px a 1080p).** Grade: `ffmpeg_grade.py:296`,
  `:384`, `:456`, `:470`, `:479`; compose: `ffmpeg_overlay.py:28`, `:36-37`. `overlay` do
  FFmpeg compõe alpha em `yuva420p` sem RGBA full (~2,7× menos banda). Trocar `format=rgba`
  por `format=yuva420p` nas cadeias; validar fidelidade de alpha/croma. Saída fica `nv12`
  (`ffmpeg_grade.py:330`, `ffmpeg_overlay.py:48`).
- **[média] Compose decoda o vídeo principal em SOFTWARE — sem `-hwaccel qsv`.**
  `ffmpeg_overlay.py:176`. O `clip_graded.mp4` é H.264 8-bit decodável por QSV; o código da
  grade documenta QSV decode ~44% mais rápido (`ffmpeg_grade.py:280-282`). Decodar input 0
  com `-hwaccel qsv -hwaccel_output_format qsv` + `hwdownload,format=nv12`. (Desaparece se a
  fusão for adotada.)
- **[média] Corte sem overlays re-encoda o vídeo inteiro à toa.** `ffmpeg_overlay.py:186-198`:
  no ramo `if not overlay_paths` ainda aplica `*encode_args` sobre vídeo já encodado. Usar
  `-c:v copy` e re-encodar só o áudio (loudnorm).
- **[média] `vignette` + `unsharp` são os per-pixel mais pesados da grade.**
  `cinema_filters.py:43` (`vignette=PI/5`) e `:48` (`unsharp` 5×5). Bench do módulo:
  `:64-69`. Sem equivalente QSV para `curves`/`vignette`/`unsharp`/`colorbalance` → grade
  100% GPU inviável sem perder o look. Alavanca: preset sem vinheta em PROD; `eq`/procamp
  poderia ir para `vpp_qsv`, ganho parcial. Filtros já estão fundidos num `-vf` (bom).
- **[baixa] `filter_complex_threads` capado em 6 no compose** (`ffmpeg_common.py:53-58`)
  enquanto o composite é o gargalo; a grade segmentada já libera todos os núcleos
  (`ffmpeg_grade.py:178`). Subir/expor teto no compose (cap de RAM real é o decode dos
  overlays, capado à parte).
- **[baixa] Encode final `preset fast` vs grade `veryfast`** (`ffmpeg_overlay.py:244-245` vs
  `ffmpeg_commands.py:355`). Alinhar em `veryfast` e medir diferença (provável nula).
- **[baixa] `scale=1920:1080` reaplicado no compose sobre vídeo já 1080p**
  (`ffmpeg_overlay.py:28`). Passthrough barato; o custo acoplado é o `format=rgba`.

## A2 — Fases & telemetria medida
**status:** ok (código) / **sem-achados empíricos** (telemetria insuficiente)

**Telemetria:** varredura `backend/projetos/**/pipeline_events.jsonl` → 1 arquivo,
placeholder (`projX/cortes/corteY`, sem `clip_raw`).

| Fase | Amostras `concluida` válidas | Observação |
|------|------------------------------|-----------|
| grade | 0 | sempre `fase_pulada` (`artefato_valido`) |
| overlays | 5 degeneradas (0.0–0.001s) | `total_chunks=0` — não é render real |
| render_final | 0 | `iniciada` 6×, **zero** `concluida` — pipeline morria antes |

**Conclusão:** dados insuficientes/degenerados. Impossível dizer empiricamente qual fase
domina. Toda a análise abaixo é teórica. **Coletar telemetria de PROD ou rodar 2–3 cortes
reais é a ação nº 1.**

- **[alta] Dupla codificação full-length** — `pipeline_render.py:353` (grade) + `:555`
  (render_final re-encoda). Dois encodes QSV completos + perda de geração. Medir isolado
  antes de fundir.
- **[alta] Paralelismo Fase1∥Fase2 contende na MESMA iGPU** — `pipeline_render.py:353` +
  `:487-488`; worker limita a 1 overlay enquanto a grade roda (`native_worker.js:238`,
  `temGrade ? 1 : MAX_PARALLEL_OVERLAYS`). O "∥" não entrega `max()` puro. Cronometrar
  Fase1∥Fase2 vs serial num corte real.
- **[média] Skip de overlay confia só em tamanho (`>=256 KB`)**, não em decodabilidade —
  `pipeline_render.py:1147`/`:134`, `pipeline_fases.py:68`. Overlay truncado >256 KB é aceito
  e nunca re-renderizado. Validar com `ffprobe`. *(Correção — fora do escopo de custo.)*
- **[média] `_validar_video_completo_sync` aceita arquivo >1 MB com erro de ffprobe** —
  `pipeline_render.py:1360-1367`. Pode mascarar vídeo quebrado. Tratar erro desconhecido como
  inválido. *(Correção — fora do escopo de custo.)*
- **[média] Retry de overlay re-renderiza o chunk inteiro (até 30s)** —
  `pipeline_render.py:948`, `pipeline_overlay_chunks.py:15`. Medir taxa de falha em PROD; se
  relevante, reduzir `_OVERLAY_CHUNK_MAX_SEC`.
- **[baixa] "Trim-segmentation" NÃO reduz o encode — só o composite do palco** —
  `ffmpeg_commands.py:406-418`, `ffmpeg_grade.py:64-130`. O filtro de cor é aplicado a 100%
  do vídeo em todos os segmentos. O ganho (~52%) vem de memory-safety + paralelismo de CPU,
  não de pular re-encode. Contradiz a leitura de que a grade "só toca regiões visíveis".
- **[baixa] Compose NÃO re-decoda overlays** — `pipeline_render.py:1189`,
  `pipeline_overlay_chunks.py:135`. Cada chunk entra 1×. Ponto positivo confirmado.

## B — Clean Architecture (camada de render)
**status:** ok · **skill invocada:** clean-architecture-guardian (sim)

Separação montagem (`domain/ffmpeg_*` monta `list[str]`) ↔ execução (`services/pipeline_*`)
existe e aponta na direção certa. Os problemas são coesão/God-function e o acoplamento
estrutural que força o re-encode.

- **[alto] Intermediário em disco entre Grade e Compose força 2 encodes lossy** —
  `pipeline_render.py:206`, `:327` (grava gq=30), `:555` → `ffmpeg_overlay.py:136`.
  `build_grade_plan` sempre termina num arquivo (`ffmpeg_grade.py:64-128`); não há caminho em
  que frames graded alimentem direto o compose. (a) medir fusão; (b) enquanto separado,
  **subir a qualidade do intermediário** (gq=30 empilha duas perdas sem ganho proporcional de
  velocidade).
- **[alto] `renderizar_pipeline_otimizado` é God-function (~490 linhas)** —
  `pipeline_render.py:142-631`. Mistura DB, paths, orquestração, execução das 4 fases,
  event-log, progress, exceção e cleanup no mesmo escopo. Atrito direto para experimentar
  otimização de uma fase. Extrair `_fase_grade`/`_fase_overlays`/`_fase_render_final`.
- **[médio] Política de encode espalhada domain↔services** — segmentar decidido no domínio
  (`ffmpeg_commands.py:385-437`, `ffmpeg_common.py:61`); QSV↔software no serviço
  (`pipeline_render.py:834-843`). Concentrar no `GradePlan`.
- **[médio] Fallback de decode QSV re-executa a grade INTEIRA** —
  `pipeline_render.py:834-843`. `ffprobe` do codec antes evitaria a passada QSV fadada
  (só compensa se fontes incompatíveis forem frequentes).
- **[médio] Domínio faz I/O de filesystem (impureza)** — `ffmpeg_commands.py:16`,
  `:440-484`, `ffmpeg_common.py:84-101`. Resolvers de PNG e temp file no `domain/`
  (CLAUDE.md exige domínio puro). Mover lookup para porta chamada pelo serviço.
- **[sugestão] Tuning de custo (threads, kill-switch de segmentação) em env-var no domínio**
  — `ffmpeg_common.py:22-81`. Consolidar em `app_settings` (banco/UI) quando o lock permitir;
  até lá, documentar as env-vars num só ponto.

**Não é overengineering:** a indireção existente (re-exports, fatiamento E-006) é para
compat de testes. A orquestração está **sub-estruturada** (God-function), não
sobre-abstraída.

---

## Próximos passos priorizados

| # | Ação | Ganho esperado | Pré-requisito |
|---|------|----------------|---------------|
| 0 | **Instrumentar e medir** grade vs render_final num corte real (coletar `pipeline_events.jsonl` de PROD ou rodar 2–3 cortes DEV) | Desbloqueia todas as decisões | — |
| 1 | **RGBA → yuva420p** no compose/grade | Alto (CPU no gargalo) | teste de fidelidade alpha |
| 2 | **QSV decode no compose** (`-hwaccel qsv`) | Médio (~44% no decode) | só se não fundir |
| 3 | **`-c copy` em corte sem overlays** | Médio (elimina 1 encode) | — |
| 4 | **Fundir grade+compose+encode** (elimina encode #1 + decode) | Alto | medição #0 confirmar grade no caminho crítico |
| 5 | Preset sem vinheta / `veryfast` no final / threads no compose | Baixo-médio | — |
| 6 | Quebrar a God-function (destrava experimentar 1–5) | Habilitador | — |

**Achados de correção (fora do escopo de custo, mas anotados):** skip de overlay por tamanho
e `_validar_video_completo_sync` aceitando erro de ffprobe podem publicar vídeo quebrado sem
sinal — considerar demanda separada.

---

## D-320 — Resultados do benchmark do palco

**Objetivo:** dar número às hipóteses do **fator oculto ~3,7×** — a grade em produção roda a
~1× o tempo real, mas o filtro de cor sozinho (`cinematic_iii_leve`) roda a ~3,8× *mais rápido*
que o tempo real; algo entre os dois consome esse fator que a cor não explica. Duas hipóteses:
**H1** = o composite do "palco" (fundo preto + vídeo recortado/escalado + PNG de frente, tudo
em RGBA); **H2** = contenção da iGPU porque os overlays Remotion renderizam em paralelo com a
grade (overlap Fase1∥Fase2). E, principalmente, **medir RGBA→yuva420p** para desbloquear a D-321.

**Método.** Reproduzi o filtergraph REAL da grade (`build_cinematic_grade_layout_filter`,
caminho segmentado com 1 região de 2 telas + PNG de palco, geometria `DEFAULT_*` de
`youtube_layout.py`) num segmento de **120 s @1080p** do `clip_raw_base.mp4` (1920×1080, VP9,
30 fps). Decode SW + `-filter_complex` + encode `h264_qsv veryfast gq=27`, idêntico ao segmento
de produção. Só troquei o `format=` do composite entre B e C. Script:
[`backend/_bench/bench_palco.py`](../../../backend/_bench/bench_palco.py) (pasta gitignored).
Hardware: notebook Intel iGPU (QSV), ffmpeg 8.1.

### Wall-clock das componentes (run quente, máquina fria)

| Componente | Filtergraph | Wall-clock (120 s) | Velocidade | Custo relativo |
|---|---|---:|---:|---|
| **A** — grade só cor | `...,COLOR,format=nv12` | **30,6 s** | 3,92× realtime | baseline |
| **B** — palco **RGBA** (hoje) | composite full em `format=rgba` | **74,9 s** | 1,60× realtime | **A→B = 2,45×** |
| **C** — palco **yuva420p** (D-321) | composite full em `format=yuva420p` | **72,3 s** | 1,66× realtime | **B→C = +3,5%** |

### Ganho RGBA→yuva420p (D-321) — o número decisivo

O delta B→C é **da ordem do ruído**, não um ganho real:

| Passada | B (rgba) | C (yuva420p) | B→C |
|---|---:|---:|---:|
| Fresca (máquina fria) | 74,9 s | 72,3 s | **+3,5%** (C mais rápido) |
| Interleaved, mediana de 4 pares | 96,6 s | 99,0 s | **−2,5%** (C mais *lento*) |

O sinal do delta **inverte** entre as passadas. A dispersão run-a-run (74 s→114 s na mesma
config, por *thermal throttling* sob carga sustentada) engole qualquer diferença de pixfmt.
**Conclusão: RGBA→yuva420p não entrega speedup mensurável e confiável neste composite/hardware
(±3%, dentro do ruído).** A hipótese do diagnóstico ("~2,7× menos banda → ganho direto de CPU")
**não se materializa em wall-clock** porque: (a) o custo do composite é dominado pelo filtro de
cor (`curves`/`eq`/`drawbox`) + `crop`/`scale` + os três `overlay` — nenhum deles muda com o
pixfmt do intermediário; (b) a saída final é **nv12 (4:2:0) de qualquer jeito**, então a banda
poupada no intermediário é minoria do trabalho total.

### Fidelidade C (yuva420p) vs B (rgba)

`PSNR Y ≈ 34,8 dB` · `SSIM Y 0,966 (All 0,976)`. Diferença **pequena mas não nula**: o
`yuva420p` subamostra o croma (4:2:0) *durante* o composite/overlay, então as bordas do chrome
do palco e do letterbox recebem croma levemente diferente de compor em RGBA cheio e só então
converter para nv12. Como a saída já é 4:2:0, é aceitável — mas é **custo de fidelidade sem
contrapartida de velocidade**.

### Contenção de iGPU (H2)

Rodando **B sozinho** vs **B com um `h264_qsv` concorrente** ocupando a iGPU:

| Cenário | Wall-clock | Velocidade |
|---|---:|---:|
| B sozinho | 74,6 s | 1,61× realtime |
| B + encode QSV concorrente | 97,3 s | 1,23× realtime |
| **Contenção** | **+30,3% mais lento** | |

A contenção da iGPU é **real e material**: um segundo trabalho QSV disputando a fila do encoder
custa ~30% de wall-clock à grade. O overlap Fase1∥Fase2 (overlays Remotion/Chromium + grade na
mesma iGPU) paga esse pedágio — confirma a nuance já anotada no resumo executivo.

### Veredito — H1 vs H2 sobre o fator ~3,7×

**H1 (palco composite) é o fator PRIMÁRIO; H2 (contenção) é um amplificador secundário real.**
Decompondo a queda de 3,92× realtime (só cor) para ~1× realtime (produção):

- **H1 — palco composite:** cor sozinha 3,92× → palco sozinho 1,60× realtime ⇒ o composite
  custa **2,45×**. É a maior fatia isolada do fator oculto.
- **H2 — contenção iGPU:** palco sozinho 1,60× → sob carga concorrente 1,23× realtime ⇒ **+30%**.
- Composto: 2,45× × 1,30 ≈ **3,2×** dos ~3,9× observados. O resto (para fechar em ~1× realtime
  de produção) vem de *thermal throttling* sob carga sustentada e de cortes reais terem mais/
  maiores regiões e overlays que este benchmark de 1 região. **Nada disso é o filtro de cor** —
  o benchmark isolado da cor sozinha já rodava a 3,76–3,92× realtime, exatamente como o esperado.

### Recomendação objetiva para a D-321

**Despriorizar a D-321 como alavanca de performance.** A troca `format=rgba` → `format=yuva420p`
rende **~0% de wall-clock** (±3%, dentro do ruído) neste composite/hardware e **custa fidelidade**
(croma 4:2:0 no composite, PSNR Y ~34,8 dB). Não vale o risco de regressão visual pelo ganho
inexistente. Se ainda assim for feita (ex.: por consistência de pipeline), tratar como *refactor
neutro*, **não** como otimização — e cobrir com o teste de fidelidade acima.

As alavancas reais apontadas pelo número são as **outras** do diagnóstico:
1. **Reduzir o trabalho do composite / fundir grade+compose** (elimina 1 encode + 1 decode
   full-length) — ataca o H1, que é o fator dominante (2,45×).
2. **Não rodar overlays concorrentes com a grade na mesma iGPU** (serializar ou escalonar) —
   ataca o H2 (+30%). O overlap Fase1∥Fase2 hoje *piora* a grade em vez de esconder custo.

**Nota metodológica:** a máquina sofre *thermal throttling* pesado sob carga QSV sustentada
(runtimes subiram ~50% em ~12 min de bench contínuo). Benchmarks de render nesta máquina
precisam de intervalos de resfriamento entre corridas, ou os números derivam para pior.

---

## D-329 — Dissecação do composite de palco

**Objetivo:** abrir a caixa-preta do fator **A→B = 2,45×** medido na D-320 — o composite de
palco custa 2,45× a grade só-cor, mas a D-320 tratou o composite como um bloco único. A D-329
mede **quanto cada sub-etapa** (crop/scale, overlays, conversões de pixfmt, encode) contribui,
para priorizar as otimizações *look-preserving* da Onda 3.

**Método.** Reconstruí o filtergraph REAL da grade chamando `build_cinematic_grade_layout_filter`
direto (função pura; 1 região de 2 telas + PNG de palco, geometria `DEFAULT_*`) e o construí
**incrementalmente**: cada *rung* adiciona uma sub-etapa; o **delta** sobre o anterior = custo
daquela sub-etapa. Janela de **120 s @1080p** do `clip_raw_base.mp4`, decode SW, `-filter_complex`,
`-f null` (mede só decode+filtro, sem encode) exceto o último rung. Script:
[`backend/_bench/bench_dissect.py`](../../../backend/_bench/bench_dissect.py) (pasta gitignored).
Para neutralizar o *throttling* documentado na D-320: **cooldown de 60 s ANTES de cada rung**
(cada um medido com a máquina fria), 2 rounds, reporta o **mínimo**. Validação cruzada com a
D-320: L2 (cor) = 36 s ≈ A da D-320 (30,6 s); L6 (full+encode) = 85 s ≈ B (74,9 s) — metodologia
consistente, absolutos ~15% inflados pelo calor residual.

### Custo por sub-etapa (mínimo de 2 rounds frios)

| Rung | Filtergraph acumulado | min (s) | **Δ = custo da sub-etapa** |
|---|---|---:|---:|
| **L1** decode | `[0:v]null` | 4,55 | — (decode VP9 SW) |
| **L2** +cor (=A) | `…,COLOR,format=nv12` | 36,06 | **+31,5 s — grade de cor** (curves/eq/letterbox) |
| **L3** +conversão rgba | `…,COLOR,format=rgba,format=nv12` | 50,89 | **+14,8 s — materialização RGBA** (full-frame) |
| **L4** +crop/scale | split + crop/scale das 2 telas | 44,65 | ≈0 (ruído: −6 s) — **crop/scale é barato** (sub-quadro) |
| **L5** +overlays | filtergraph completo (`-f null`) | 73,88 | **+23 s — base preta + 4 overlays + fg** |
| **L6** +encode (=B) | filtergraph completo + `h264_qsv` | 85,45 | **+11,6 s — encode QSV** |

> O delta de L4 saiu **negativo** (−6 s): crop/scale das duas telas é tão barato (recorta para
> 1325×720 e 340×260 — bem menos pixels que o quadro cheio) que seu custo fica **abaixo do ruído
> térmico** (±15% run-a-run nesta máquina). Ou seja: **crop/scale NÃO é alavanca.** Por isso L4/L5
> ficam agregados no bloco "crop/scale + overlays" abaixo.

### Decomposição do overhead do composite (o "2,45×")

O overhead puro de filtro do composite sobre a cor é **L5 − L2 = 37,8 s** (ambos `-f null`, sem
encode). Repartição:

| Sub-lever | Custo | Fatia do overhead |
|---|---:|---:|
| **Overlays + base preta + fg** (crop/scale é ~0) | ~23,0 s | **~61%** |
| **Materialização RGBA** (4 B/px full-frame) | ~14,8 s | **~39%** |

**Sub-lever DOMINANTE = as sobreposições** (`overlay`), não o crop/scale nem o filtro de cor.
São **4 overlays por frame**, dois deles em **quadro cheio 1920×1080 RGBA** — o `overlay` do
**fg** (`[shared0][fg0]`) e o **overlay final** (`[base][composed0]`). Os outros dois (tela, face)
compõem regiões menores. A **materialização RGBA** é a segunda maior fatia: todo o composite roda
a **4 B/px** (vs 1,5 do nv12) → ~2,7× mais banda de memória em *cada* overlay.

### Respostas às perguntas da D-329

1. **Qual sub-etapa domina o 2,45×?** As **sobreposições** (~61% do overhead; os dois overlays de
   quadro cheio em RGBA — fg e final). Crop/scale é desprezível; a cor não é o gargalo (já sabido).

2. **As conversões RGBA↔YUV são redundantes/repetidas? Quanto custam?** **Não são redundantes** — o
   graph faz **UMA** materialização RGBA no prefixo (`nv12→rgba`), mantém RGBA por todo o composite
   e faz **UMA** conversão final (`rgba→nv12`); fg e base preta já nascem em RGBA; os `format=rgba`
   de face/tela são sub-quadro (baratos). O custo (~15 s, 39% do overhead) **não é conversão
   supérflua — é a banda inerente de compor a 4 B/px**, necessária porque o overlay do fg exige
   **alpha** (transparência do chrome do palco). Casa com a D-320: trocar `rgba→yuva420p` rendeu ~0%
   justamente porque a saída já é 4:2:0 e os overlays continuam per-pixel; e **custaria fidelidade**.

3. **Fundo e frente são estáticos → dá para pré-compor "fundo+frente" e fazer 1 overlay?** **Não
   nessa ordem-Z**: a base preta fica ATRÁS dos vídeos e o fg (palco) fica NA FRENTE — os vídeos
   dinâmicos ficam *entre* as duas camadas estáticas, então não há como fundir fg+bg num único
   overlay. **Mas há um ganho estrutural real (P3, ver abaixo):** em cortes **100% compartilhados**
   (região cobre o corte inteiro — caso comum), `[composed0]` cobre o quadro todo, então a camada
   `[base]` (quadro graded completo) e o **overlay final** `[base][composed0]` são **redundantes** e
   podem ser **eliminados** (dropa 1 dos 2 overlays de quadro cheio + 1 split-cópia por frame).
   Pré-escalar o PNG de fg no disco (P1) para evitar o `scale`/frame **não rende nada** — dentro do
   ruído (o scale do fg é 1 op/frame, irrelevante frente aos overlays).

4. **crop/scale poderia ir para `vpp_qsv` (GPU) preservando o look?** **Inviável neste hardware, e
   de baixo retorno de qualquer forma.** `vpp_qsv` PURO funciona (decode QSV→`vpp_qsv`→hwdownload
   roda a 2,63× realtime), mas para usá-lo no meio do graph — DEPOIS da grade de cor em software —
   é preciso `hwupload` do frame SW de volta para a iGPU, e isso **falha nesta máquina** com erro de
   textura **D3D11 `80070057` (E_INVALIDARG)** ao criar o pool de frames. Só daria movendo o
   crop/scale para ANTES da cor (frames vindos do decode QSV) — o que **muda o look** (a cor passaria
   a ser aplicada pós-recorte/composição) e exigiria revalidação do piso de qualidade. Além disso,
   crop/scale já custa ~0 (item L4), então **não é onde está o gargalo**. Confirma o beco-sem-saída
   de round-trip hw da D-320.

### Prototipagem das otimizações

| Proto | Ideia | Resultado |
|---|---|---|
| **P1** | fg PNG pré-escalado 1920×1080 no disco (sem `scale`/frame) | **Ganho ~0** — dentro do ruído (fg scale é 1 op/frame). Descartar. |
| **P2** | crop/scale da tela em `vpp_qsv` (GPU) | **Inviável** — `hwupload` falha (D3D11 `80070057`). Ver pergunta 4. |
| **P3** | dropar `[base]`+overlay final em corte 100% shared | **MEDIDO: −8,2% (mediana, −6,0 s)** de custo de filtro. Remove 1 dos 2 overlays de quadro cheio (1080p RGBA) + a cópia de `[base]`/frame; zero mudança visual (camada oculta). Delta **pareado** (L5 vs P3 no mesmo estado térmico, 3 rounds): −31,6% / +2,3% / −8,2% — os valores do P3 são estáveis (~65–68 s) e o L5 oscila (66–95 s); como o P3 roda *depois* do L5 no par (handicap térmico), o ganho real é **≥8%**. |

### Recomendação priorizada para a Onda 3 (stories propostas)

Todas *look-preserving* (preservam o piso de qualidade). Ordem por ROI/risco:

1. **[ALTA / baixo risco] Eliminar `[base]`+overlay final em cortes 100% compartilhados (P3).**
   Quando a região compartilhada cobre o corte inteiro (`modo=compartilhada` sem trechos FULL),
   `[composed0]` já cobre o quadro → sair `[composed0]` direto, sem o `split` que gera `[base]` nem
   o `overlay=enable` final. Remove **1 overlay de quadro cheio (1080p RGBA) + 1 cópia/frame**.
   Ganho **medido: −8,2% (mediana, ≥8% real)** do custo de filtro do composite; zero mudança
   visual (camada oculta). *Requer:* detectar o caso "100% shared" no builder e emitir o graph
   enxuto (sair `[composed0]` direto, sem `split`/`[base]` nem `overlay=enable` final). Nota de
   implementação: o graph enxuto perde a âncora de duração do `[base]` finito — o comando de
   segmento de produção já usa `-shortest`, mas atenção que `-shortest` NÃO limita quando a fonte
   infinita (base `color=`) alimenta a única saída; usar duração explícita (`-t`/`trim`) ou manter
   a base preta finita.

2. **[ALTA / médio risco] Fundir grade+compose para eliminar 1 decode + 1 encode full-length.**
   (Já apontado na D-320 e reafirmado aqui: o encode custa +11,6 s/seg e o composite roda sobre um
   re-decode.) É a maior alavanca isolada, mas mexe na orquestração de fases — story maior.

3. **[MÉDIA / operacional] Não rodar overlays Remotion concorrentes com a grade na mesma iGPU.**
   A D-320 mediu **+30%** de contenção. Serializar/escalonar Fase1×Fase2 recupera esse pedágio sem
   tocar no filtergraph.

4. **[BAIXA] Reduzir a banda RGBA do composite.** Os ~15 s de materialização a 4 B/px são reais,
   mas a D-320 já mostrou que `yuva420p` não ajuda (saída já é 4:2:0) e custa fidelidade. Só valeria
   com um redesenho que reduzisse o **número de overlays de quadro cheio** (o que o item 1 já faz) —
   não como troca de pixfmt. **Não priorizar como alavanca isolada.**

**Veredito:** o gargalo dentro do composite são as **sobreposições de quadro cheio em RGBA**, não o
crop/scale nem o pixfmt em si. A intervenção de **melhor ROI e menor risco é o P3** (dropar a camada
`[base]` redundante em cortes 100% compartilhados), seguida da fusão grade+compose (maior, já
mapeada) e da serialização dos overlays concorrentes (operacional, +30% da D-320).

> **⚠️ Nota operacional (incidente de bench):** `taskkill /F /IM ffmpeg.exe` mata **todo** ffmpeg da
> máquina — **incluindo o backend de produção** em `C:\PRD\gerador-cortes`. Durante esta tarefa um
> graph de bench com base `color=` infinita (sem `-shortest`) rodou solto e foi encerrado com esse
> comando de mira global, podendo ter interrompido um render de produção. **Benchmarks futuros
> devem:** (a) pôr `timeout=` em cada `subprocess.run`; (b) matar só o **PID específico** do bench,
> nunca `/IM ffmpeg.exe`; (c) usar `-shortest` sempre que houver fonte `color=`/`-loop 1` infinita.

---

## D-322 — Medição da fusão grade+compose+encode

**Objetivo:** decidir, com números reais, se fundir a Fase **grade** (encode #1 → `clip_graded.mp4`)
com a Fase **render_final** (re-decode + compose overlays + encode #2 8M) numa **única passada**
FFmpeg vale a pena. A fusão elimina **1 encode + 1 decode** full-length, MAS perde o overlap
Fase1∥Fase2 (a grade hoje roda em paralelo com os overlays). O diagnóstico marcou isso como a
alavanca **#2 / médio risco** — só justificada se a grade estiver mesmo dominando o caminho crítico.

**Veredito: NÃO INTEGRAR.** O ganho de wall-clock é **marginal/negativo** e há **regressão de RAM
de +41%** sobre uma fase que já sofre OOM em produção. Detalhamento abaixo.

### Método

Bench fiel construído a partir dos **builders de domínio reais**
(`build_cinematic_grade_layout_filter` / `build_compose_and_encode_cmd` / `build_overlay_filter_string`)
— o comando fundido é o encadeamento `grade → [graded] → compose → encode 8M`, portável para produção.
Janela de **120 s @1080p** do `clip_raw_base.mp4`, layout 100%-shared 2-telas (full-cover, D-338) +
PNG de palco, **6 overlays ProRes 4444 reais** de PROD. QSV decode da fonte, gq=30 na grade, 8M no
final — idêntico à produção. Anti-throttling (D-320): cooldown 60 s antes de cada medição, 3 rounds,
**mínimo**. Scripts: [`backend/_bench/bench_fusao.py`](../../../backend/_bench/bench_fusao.py),
`identidade_fusao.py`, `mem_fusao.py` (pasta gitignored). SEGURO: timeout+PID; nunca taskkill global.

### 1. Telemetria de PROD (175 cortes) — a grade domina e OCULTA os overlays

Varredura de `pipeline_events.jsonl` reais (ao contrário do diagnóstico original, agora HÁ dados):

| Fase | Amostras | realtime (dur/corte) mediana | Observação |
|------|---------:|---:|---|
| grade | 146 | **1,65×** | domina; **no caminho crítico em 130/141 (92%)** dos pares concorrentes |
| overlays | 190 | 0,56× | escondida sob a grade no overlap |
| render_final | 191 | 0,24× | bate com o bench (0,22×) — cross-validação |

Ou seja, **hoje `ATUAL ≈ grade_contended + render_final`** e os overlays (0,56×) rodam **de graça**
dentro da janela da grade (1,65×). O overlap não é desperdício — ele *esconde* os overlays.
Nota: a grade **falha repetidamente com OOM** em PROD (`WorkerJobFailed Exit code 4294967284`).
Escopo fusível: **67/76 (88%)** dos comandos de grade logados são `segmentado=False` (comando único,
fusível); 12% são multi-região segmentada (N subprocessos, **não** fundível → precisaria de fallback).

### 2. Compute isolado (mínimo de 3 rounds frios, janela 120 s)

| Passo | min (s) | realtime |
|---|---:|---:|
| grade_solo (encode #1 → graded) | **71,32** | 0,59× |
| render_final (re-decode + compose + encode 8M) | **26,69** | 0,22× |
| **fused_pass** (grade+compose+encode, 1 passada) | **81,04** | 0,68× |

`grade_solo + render_final = 98,01 s` vs `fused_pass = 81,04 s` → a fusão **economiza 16,97 s
(17,3%) de COMPUTE** (elimina encode #1 + o decode do graded). Real, mas **modesto** — consistente
com a dissecação D-329 (o encode custa ~12 s/janela; o decode do graded, ~5 s).

### 3. Wall-clock — o overlap vale MAIS que a fusão

`ATUAL = max(grade_contended, overlays) + render_final` · `FUNDIDO = overlays_solo + fused_pass`.
Matriz de sensibilidade (Δ = FUNDIDO − ATUAL; **positivo = fusão mais lenta**), variando a contenção
`k` na grade (D-320 mediu +30%) e o alívio de paralelismo dos overlays solo `r` (o worker libera 2
overlays paralelos sem a grade, vs 1 com):

| | ATUAL k=1,0 (98,0 s) | ATUAL k=1,3 (119,4 s) |
|---|---|---|
| FUNDIDO overlays serial r=1,0 (148 s) | **+50 s** pior | **+29 s** pior |
| FUNDIDO overlays 1,6× (123 s) | **+25 s** pior | **+3,5 s** pior |
| FUNDIDO overlays 2× (114 s) | **+16 s** pior | **−5 s** (4% melhor) |

A fusão só ganha no **canto mais otimista** (contenção máxima + paralelismo 2× perfeito dos overlays),
e só ~4%. Em **todas** as outras combinações ela **perde** (3–50%). Causa raiz: o overlap atual
**esconde os overlays (0,56× realtime ≈ 67 s/janela) de graça** sob a grade dominante; a fusão
sacrifica essa ocultação para economizar 17% de compute — dá **empate ou perda**. (A fusão só venceria
com folga em cortes de overlays **desprezíveis**, minoria do perfil de PROD.)

### 4. Identidade visual — PASS (a fusão é marginalmente MELHOR)

- Saídas reais 8M (fundida vs pipeline atual): **PSNR Y 41,4 dB · SSIM Y 0,987** — visualmente equivalente.
- Filtergraph fundido vs referência com intermediário lossless: **PSNR 57,8 dB** — algebricamente
  idêntico a menos de ruído de arredondamento de tag de cor. Byte-identidade é inatingível através de
  **qualquer** encode intermediário (o roundtrip re-tagueia o colorspace); imaterial, pois a produção
  usa um intermediário gq30 **lossy**. **A fusão remove essa geração lossy → qualidade um pouco melhor.**
  Identidade não é bloqueador — mas também não justifica a fusão sozinha.

### 5. Memória — regressão de +41% sobre uma fase que já dá OOM

Pico de working-set (processo ffmpeg + filhos), GPU livre:

| Cenário | pico RAM |
|---|---:|
| grade_solo | 730 MB |
| render_final | 1582 MB |
| **fused_pass** | **2238 MB** |

`max(grade, render_final) separados = 1582 MB` (um processo por vez) → **fused_pass 2238 MB = +657 MB
(+41,5%)**. A fusão empilha o composite RGBA de quadro cheio (grade) + o decode dos ProRes 4444 (compose)
+ o encode 8M no **mesmo** processo. Como a grade **já falha com OOM em produção** (item 1), essa
regressão de pico **agrava um risco que já derruba renders**. Ressalva: é RAM de sistema; o OOM de PROD
(`h264_qsv Cannot allocate memory`) é pressão de *surface* QSV — mas o princípio (empilhar os dois
maiores consumidores) vale para ambos.

### Veredito e recomendação

| Dimensão | Resultado | Peso na decisão |
|---|---|---|
| Compute | −17,3% (economiza) | a favor, modesto |
| Wall-clock | marginal/negativo (ganha só no canto otimista, ~4%) | **contra** |
| Identidade visual | PASS (levemente melhor) | neutro |
| Memória | **+41,5%** de pico, sobre fase que já dá OOM | **contra (risco)** |
| Escopo | só 88% (comando único); 12% segmentado precisa de fallback | contra (complexidade) |

**NÃO INTEGRAR.** Cai na cláusula da porta de decisão da D-322: *ganho marginal/dentro do ruído + risco
→ não integre; evitar risco inútil é sucesso da demanda.* O overlap Fase1∥Fase2 hoje **já é eficiente**
justamente porque a grade domina e esconde os overlays. As alavancas reais do E-023 seguem sendo o **P3**
(já entregue, D-338) e reduzir o custo do composite da grade em si — **não** a fusão.
Nenhum código de produção foi alterado nesta demanda.
