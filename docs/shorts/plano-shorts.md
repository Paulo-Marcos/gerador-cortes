# Plano — Fábrica de Shorts (verticais) + Publicação multiplataforma

> Documento canônico de escopo. Origem: pedido do dev em 2026-08-31.
> Antecedentes: **D-345** removeu a feature Shorts morta (commit `b25934b`);
> **D-358** ("Reativar feature Shorts") ficou parkeada no Backlog. Este plano
> substitui a D-358 e a expande.

## 1. Premissa editorial

O corte marcado com **Fire** já passou pelo funil inteiro (proposta da IA →
aprovação humana → remoção de desvios → bruto gerado). É nata. Logo, a extração
de shorts **não precisa garimpar**: precisa recortar o que já é ouro. Isso muda o
custo da análise humana de "ler tudo" para "escolher entre 3-5 candidatos bons".

Consequência de arquitetura: o insumo da IA de shorts é a transcrição **do bruto**
(espaço de tempo pós-remoção), não a da live.

## 2. O que já existe no repositório

| Peça | Estado | Onde |
|---|---|---|
| Flag `is_fire` | viva | `metadados_cortes.is_fire`, toggle em `services/metadados.py:154` |
| Tabelas `shorts` / `metadados_shorts` | **órfãs, preservadas** (6 registros em PROD) | banco; sem model desde D-345 |
| Serviço Shorts antigo (561 linhas) | removido, recuperável | `git show b25934b^:backend/app/services/shorts.py` |
| Pipeline do bruto com passos nomeados | vivo | `ExportService.gerar_bruto_via_worker`, `BrutoProgress` (`silencios` → `transcricao` → `cenas`) |
| Timing por palavra | vivo | `domain/json3_parser.py` (auto-legenda do YouTube, `tOffsetMs`) |
| Diarização | viva (D-286) | `services/diarizacao.py` (pyannote) |
| Filtro `cinematic_iii` | vivo | `domain/cinema_filters.py:59` |
| Catálogo de cenas Remotion | vivo, **travado** | `video-renderer/src/cenas-v2/` (lock `remotion-v2-card-contracts`) |
| OAuth + upload YouTube | vivo | `services/youtube.py`, `services/youtube_auth.py` |
| Limpeza de mídia | viva | `services/media_retention.py` (`clip_raw` só morre na limpeza terminal, D-430) |

**Fato técnico decisivo:** todo o render é **1920x1080 hardcoded** — em
`domain/ffmpeg_grade.py` (`scale=1920:1080`, base `color=...s=1920x1080`) e nas
composições do `video-renderer/src/Root.tsx`. Vertical não é "trocar um número":
é parametrizar resolução no grade e criar composições próprias. É o maior risco
do épico e por isso vira um épico só dele.

## 3. Pesquisa de mercado (agosto/2026)

### Formato e retenção
- Decisão de ficar ou passar acontece em **~1,5–3s**. Hook nos segundos 0–3,
  promessa em 3–5, entrega no meio, CTA curto no fim.
- **85% das visualizações são no mudo** → legenda obrigatória, presente desde a
  primeira palavra (sem atraso de 2s), 4–7 palavras por bloco, alto contraste,
  dentro da safe zone (topo/base ocupados pela UI dos apps).
- Duração ótima: **30–60s** no Shorts, **15–30s** no Reels (completion rate),
  TikTok tolera mais longo.
- O **primeiro frame vira a capa automática** — não desperdiçar com logo/intro.

### Legendas técnicas
- `@remotion/captions` (Remotion ≥ 4.0.216) tem `createTikTokStyleCaptions`,
  com `combineTokensWithinMilliseconds` controlando o agrupamento
  (200–500ms = palavra a palavra clássico; 1200–2000ms = frases).

### Publicação por API
| Plataforma | Caminho | Fricção real |
|---|---|---|
| **YouTube Shorts** | `videos.insert` da Data API v3 (não existe endpoint dedicado). Vertical 9:16, ≤3min. Cota: **1.600 unidades por upload**, teto diário 10.000 → **~6 uploads/dia**. Título 100 chars, ~40 visíveis no feed. `#shorts` opcional em 2026. | Baixa — já temos OAuth. Cota é o limitante. |
| **YouTube Shorts — capa** | Desde **24/07/2026** o YouTube permite thumbnail custom em Shorts (rollout começou pelo YPP). | Reaproveita o gerador de capas atual. |
| **Instagram Reels** | Graph API: conta Business/Creator ligada a Página do Facebook + permissão `instagram_business_content_publish`. Fluxo container → `media_publish`; upload via `rupload.facebook.com` ou `video_url` **público**. 9:16, 5–90s. Limite 100 posts/24h. | **App review de 2–4 semanas** + screencast + privacy policy. |
| **TikTok** | Content Posting API, escopo `video.publish`, Direct Post. | **Cliente não auditado só publica em modo privado.** Audit de 2–4 semanas. |
| **TikTok horizontal** | Sim, aceita 16:9. E há **boost declarado para landscape > 60s**. Mas 16:9 toca em janela pequena com tarjas → watch time cai. | Baixa (é upload normal). |

**Leitura:** só o YouTube é API "de graça" hoje. Instagram e TikTok exigem app
review de app público — um app local de canal único paga um preço alto por isso.
Daí o plano prever um **modo manual assistido** como caminho principal e a API
como upgrade opcional.

## 4. Decisoes tomadas (2026-08-31)

| Tema | Decisao |
|---|---|
| Volume e duracao | **5 a 8 shorts por Fire, de 15 a 90s** — 15–30s serve Reels, ate 90s serve conteudo denso |
| Enquadramento | **Crop 9:16 centrado no palco** — tela cheia, sem tarja e sem blur-pad |
| Transcricao | **ASR local** (faster-whisper/Parakeet) sobre o audio do bruto; `json3_parser` fica como fallback |
| Publicacao | **Manual assistido agora, API depois**, sobre uma camada de destino plugavel — sem reescrita quando o audit sair |

## 5. Épicos

Ordem de ondas: **E-030** → (**E-031** ∥ **E-032**) → **E-033** → **E-034** → **E-035**.
Toda a implementação em worktree separada; integração para PROD só no fim.

### E-030 — Domínio Shorts: modelo + geração automática na esteira do bruto
1. Reativar model `Short` (+ `StatusShort`) sobre as tabelas órfãs; migração de
   reconciliação (padrão D-403) para bancos antigos.
2. Novo passo `shorts` no `BrutoProgress`, disparado **depois** de `transcricao`,
   **somente** quando `metadado.is_fire` — fire é o gatilho padrão, sem opt-in.
3. Serviço `shorts.gerar_sugestoes_ia`: recebe a transcrição no espaço de tempo
   do bruto, devolve N candidatos com `inicio`/`fim`/`titulo`/`gancho`/`score` e
   justificativa. Base recuperável do `shorts.py` da D-345.
4. Prompt e critérios **no banco por canal** (`editorial_skill` + scaffold),
   nunca hardcoded — dívida que a D-358 registrou explicitamente.
5. Registro em `llm_calls` (custo/latência) como as demais chamadas.

### E-031 — Retenção do bruto dos Fires
1. `MediaRetentionService.limpar_projeto` passa a **preservar `clip_raw` de
   cortes fire** por padrão, reportando o que preservou.
2. UI de limpeza do projeto pergunta explicitamente: "limpar também os brutos dos
   Fires?" (default **não**), mostrando quantos GB estão retidos.
3. Tela de Shorts ganha ação por corte: "descartar bruto" (com aviso de que isso
   encerra a fábrica de shorts daquele corte).

### E-032 — Ambiente Shorts (UI)
1. Nova aba/rota `/shorts` no Workbench: lista de Fires **que têm bruto**, com
   contagem de shorts sugeridos e status.
2. Detalhe do Fire: player do bruto + faixa dos candidatos na timeline, cada um
   com título, gancho, score e transcrição do trecho; aprovar / rejeitar / ajustar
   bordas.
3. Estado persistido — o trabalho é assíncrono ao pipeline principal, por design.

### E-033 — Transcrição fiel + legendas
1. **Transcrição fiel**: ASR local sobre o áudio do bruto (faster-whisper ou
   Parakeet), palavra a palavra, substituindo a auto-legenda do YouTube no
   contexto do short. Fallback: `json3_parser` que já entrega `tOffsetMs`.
2. Aproveitar a diarização (D-286) para não legendar fala de terceiro como do canal.
3. Componente de legenda no Remotion via `@remotion/captions`, 4–7 palavras,
   safe zone, realce da palavra corrente, tema por canal.

### E-034 — Render vertical 9:16
1. **Parametrizar a resolução** em `ffmpeg_grade`/`pipeline_render` (hoje 1920x1080
   fixo). Kill-switch e não-regressão do horizontal são requisito de aceite.
2. Estratégia de enquadramento (decisão pendente, §5): crop centrado, blur-pad ou
   layout dedicado.
3. Filtro `cinematic_iii` aplicável ao short.
4. **Novas cenas Remotion verticais** — diretório próprio (`cenas-shorts/`), pois
   `cenas-v2/` está sob o lock `remotion-v2-card-contracts`. Repertório enxuto:
   hook/título de abertura, destaque numérico, citação, CTA final.

### E-035 — Publicação multiplataforma
1. **YouTube Shorts por API** (reaproveita OAuth); capa custom; respeitar a cota
   de ~6 uploads/dia com fila.
2. **Pacote de publicação manual assistido** (caminho principal para IG/TikTok):
   pasta pronta com MP4 + capa + `publicar.txt` (título, descrição, hashtags),
   botões de copiar campo a campo, e handoff para o celular (QR code / pasta
   sincronizada). É o padrão de mercado para quem não passa por app review.
3. **APIs de Instagram Reels e TikTok** como trilha opcional, atrás de credencial
   configurável por canal — só faz sentido depois do audit.
4. **Cortes horizontais no TikTok**: reaproveitar o MP4 16:9 já publicado no
   YouTube, com título/hashtags adaptados. Entra como destino extra do fluxo
   horizontal existente, não como fluxo novo.
5. Adaptação de metadados por plataforma (título curto para o feed, hashtags,
   CTA para o vídeo longo) reaproveitando o gerador atual.


## 6. Passo a passo (demandas criadas)

**E-030**
- `D-452` Reativar o model Short sobre as tabelas orfas
- `D-453` Skill editorial de shorts no banco por canal
- `D-454` Sugerir shorts pela IA sobre a transcricao do bruto
- `D-455` Disparar a geracao de shorts como 2o passo do bruto

**E-031**
- `D-456` Preservar o bruto dos cortes Fire na limpeza
- `D-457` Perguntar sobre os brutos dos Fires ao limpar o projeto

**E-032**
- `D-458` Rota /shorts com a lista de Fires que tem bruto
- `D-459` Curar os candidatos a short de um Fire
- `D-460` Descartar o bruto de um Fire pela tela de Shorts

**E-033**
- `D-461` Transcricao fiel por ASR local sobre o audio do bruto
- `D-462` Legenda animada estilo TikTok no Remotion

**E-034**
- `D-463` Parametrizar a resolucao do pipeline de render
- `D-464` Enquadramento 9:16 por crop centrado no palco
- `D-465` Cenas Remotion verticais para shorts
- `D-466` Renderizar o short de ponta a ponta

**E-035**
- `D-467` Camada de destinos de publicacao plugavel
- `D-468` Publicar shorts no YouTube por API
- `D-469` Pacote de publicacao manual assistido
- `D-470` Subir os cortes horizontais no TikTok

Parkeado: `D-471` — publicar por API no Instagram Reels e no TikTok (so depois do app review).
Cancelada: `D-358` — absorvida por este programa.

## 7. Notas de execucao

- Implementacao em **worktree separada**; integracao para PROD so no fim.
- Locks no caminho: `models.py`/`main.py`/`database.py` exigem
  `[unlock:editor-cortes-stage-medallion]`; `api.ts` exige
  `[unlock:adicoes-exigem-autorizacao]`; `cenas-v2/` fica intocado
  (`remotion-v2-card-contracts`) — dai as cenas verticais irem para `cenas-shorts/`.
- Nao-regressao do render horizontal e criterio de aceite da D-463, nao um cuidado.


---

## 8. Execucao (2026-09-01)

Os seis epicos foram entregues na branch `codex/shorts`, 23 commits, cada
demanda com gate CI completo verde. Estado final dos gates: backend **2252
passed** com ruff limpo, frontend **542 passed** com tsc/eslint zerados,
video-renderer tsc/eslint zerados.

### Desvios do plano, com motivo

**D-463 nao parametrizou o `ffmpeg_grade`.** A grade compoe o palco editorial do
video LONGO e o short nao passa por ela — ele nasce de um recorte do bruto.
Mexer no arquivo mais sensivel do render para alimentar um caminho que nao o usa
contraria o criterio de aceite da propria demanda ("o horizontal nao pode
regredir"). O vocabulario de formato virou `domain/formato_video.py`, e a grade
segue 1920x1080 por decisao registrada. Detalhe no docstring do modulo.

**D-461 entregou o ASR desligado.** A arquitetura esta completa (contrato
`Palavra`, adaptador isolado, degradacao para a auto-legenda), mas
`faster-whisper` e dependencia pesada com download de modelo. Instalar sem o dev
por perto seria decidir por ele. Documentado no `requirements.txt`.

**D-459 nao desenhou faixa de candidatos na timeline.** O `<video controls>`
nativo nao aceita marcacao; a faixa exige um player customizado inteiro. Com 4 a
5 candidatos num bruto de 10 minutos, o `MM:SS` + "tocar trecho" responde a mesma
pergunta. Registrado como pendencia para decidir depois do uso.

**D-468 e D-469 sairam num commit so.** Os dois destinos vivem no mesmo arquivo e
diferem em poucas linhas cada; dividir exigiria fatiar hunks sem ganho de
leitura. Motivo no corpo do commit, conforme a convencao permite.

### O que NUNCA rodou junto

FFmpeg, Remotion e composicao. Os testes da D-466 dublam o worker: eles provam a
DECISAO (ordem dos passos, intervalo, 9:16, alpha, props), nao a execucao.
Renderizar um short de verdade e o teste que valida a E-033 e a E-034 de uma vez.

Da mesma forma, nenhum candidato foi gerado por IA de verdade: a qualidade do que
a `shorts-expert` propoe so se conhece rodando um bruto de Fire real.
