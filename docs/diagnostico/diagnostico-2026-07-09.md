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
[`backend/_bench/bench_palco.py`](../../backend/_bench/bench_palco.py) (pasta gitignored).
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
