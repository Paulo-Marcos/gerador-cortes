# Catálogo de regras de negócio (RN-xx)

> Criado na D-667 a partir do rascunho do diagnóstico de 16/09/2026, com **cada
> regra conferida contra o código de 22/09/2026**. As referências apontam para
> **funções e módulos**, não para números de linha — linha muda no primeiro
> commit; nome de função sobrevive.
>
> Ao tocar num desses pontos, cite a RN na docstring (`RN-07: ...`). Ao mudar
> uma regra, atualize a linha dela aqui no mesmo commit.

Legenda de **origem**: a decisão (D-NNN) citada no próprio código que criou ou fixou a regra.
"—" = o código não cita a decisão; não foi inventada uma.

## A. Ciclo de vida

| RN | Regra | Onde mora | Origem |
|---|---|---|---|
| RN-01 | **Ciclo do Projeto**: pendente → baixando → transcrevendo → pronto → analisando → analisado. Qualquer etapa pode ir para `erro`. Os desvios permitidos (reiniciar, reanalisar, refazer transcrição, voltar ao status anterior quando a análise falha) estão na tabela. Nos caminhos em segundo plano, transição fora da tabela vira **aviso no log**, não exceção. | `domain/projeto/ciclo_projeto.py` (`transicao_permitida`); aplicada por `services/ciclo_de_vida.py` (`mudar_projeto`) | D-665 |
| RN-02 | Projeto em `erro` por falta de legenda volta a `pronto` quando a transcrição é obtida. | `routers/projetos.py` (`refazer_transcricao`) | D-444 |
| RN-03 | **Reanalisar apaga os cortes** do projeto e o devolve a `pronto`. Exige transcrição. | `routers/projetos.py` (`reanalisar`) | — |
| RN-04 | **Ciclo do Corte**. O operador pode: proposto → aprovado; aprovado → proposto (o botão é liga/desliga); processado → proposto; rejeitado → proposto ou aprovado. O sistema (render final, export) marca `processado`. Pedido do operador fora da tabela é **recusado com 400**, antes de qualquer campo ser tocado. | `domain/corte/ciclo_corte.py` (`validar_pedido_do_operador`, `sistema_pode_marcar`); PATCH em `services/corte.py` (`CorteService.atualizar`); `routers/cortes.py` (`aprovar_corte`) | D-665 |
| RN-05 | **Corte rejeitado não conta** no total do projeto. O status de export lista só `aprovado` e `processado`. `rejeitado` é legado: hoje "Rejeitar" **exclui** o corte. | `routers/projetos.py` (contagem com `status != REJEITADO`); `routers/export.py` (`status_export`) | D-665 |

## B. Corte, tempo e ordem

| RN | Regra | Onde mora | Origem |
|---|---|---|---|
| RN-06 | O `numero` do corte deriva de `inicio_seg`, exceto quando a posição foi fixada à mão. | `domain/corte/ordem_cortes.py` (`ordenar_por_tempo`, `pins_para_ordem`) | D-448 |
| RN-07 | **Duração líquida** = intervalo − desvios (corte e bloco) ou soma dos segmentos (short). `fim − inicio` mente quando há buracos. | `domain/corte/juncao_cortes.py` (`duracao_liquida`); `domain/corte/arranjo_blocos.py` (`duracao_liquida`); `domain/short/segmentos_short.py` (`duracao_liquida`); `services/pipeline_corte_fields.py` (`_duracao_layout_corte`) | D-575 |
| RN-08 | Os tempos do **Short** estão no espaço do **BRUTO** (o clip do corte), não da live. | `models.py` (invariante documentada em `Short`) | — |
| RN-09 | Segmentos do short: lista vazia = janela única; a ordem é decisão do operador e **nunca** é reordenada; com segmentos, `inicio_seg`/`fim_seg` viram o envelope. | `domain/short/segmentos_short.py` (`normalizar`, `efetivos`) | D-604 |

## C. Layout, palco e gancho

| RN | Regra | Onde mora | Origem |
|---|---|---|---|
| RN-10 | **Cascata de layout PARCIAL**: chave ausente herda do nível de cima (global → projeto → corte). Os padrões só se materializam na **leitura**, nunca ao gravar — materializar mata a herança. | `domain/corte/youtube_layout.py` (`resolver_layout_em_cascata`, `normalizar_layout_youtube`); no front, `resolveLayoutChain` em `features/editor/fase2/youtubeLayout.ts` | F-048 |
| RN-11 | O **palco padrão do corte** é herança viva para os shorts; corte sem região herda região a região. | `services/palco_shorts.py` (`com_palco_do_corte`) | D-570 |
| RN-12 | **Gancho**: a aparência (cor, realce, fonte, tamanho, duração) herda do preset de gancho do corte (`''`/`0` = padrão); o **texto nunca herda**. | `domain/short/gancho_short.py` (`normalizar_*`); `services/palco_shorts.py` (`_aparencia`) | D-594, D-600 |
| RN-13 | Gancho normalizado: de 4 a 7 palavras, no máximo 90 caracteres, começa com maiúscula; duração entre 1,5 e 5 s (padrão 2,5 s). | `domain/short/gancho_short.py` (`normalizar_gancho`, `esta_na_faixa`, `normalizar_duracao`) | D-565 |

## D. Fire, shorts e retenção

| RN | Regra | Onde mora | Origem |
|---|---|---|---|
| RN-14 | **Fire** (julgamento sobre o corte) é independente de `candidato_shorts` (aposta sobre um trecho). | `models.py` (`MetadadoCorte.is_fire`, `candidato_shorts`) | D-502 |
| RN-15 | **Limpar**: remove a mídia do que subiu e de corte sem Fire; o texto fica. Fire com shorts pendentes guarda bruto, shorts e mp4. | `services/media_retention.py` (`limpar_projeto`, `_brutos_de_fire`, `_midia_de_fire_pendente`) | D-598 |
| RN-16 | O MP4 horizontal só pode ser apagado quando **todos** os destinos publicaram. Lista vazia **não** libera (corte sem destino conhecido ainda não foi a lugar nenhum). | `domain/publicacao/retencao_publicacao.py` (`pode_apagar_o_mp4`) | D-512 |
| RN-17 | "Shorts finalizados" é **declaração do operador**, não dedução a partir das publicações. | `models.py` (`shorts_finalizados_em`) | D-593 |

## E. Publicação e descoberta

| RN | Regra | Onde mora | Origem |
|---|---|---|---|
| RN-18 | Ritmo de publicação: cadência por plataforma (cabe hoje / espera até o próximo). No YouTube o teto vem da quota (10.000/dia, 1.600 por upload). | `domain/publicacao/ritmo_publicacao.py` (`cadencia_de`, `cabe_hoje`, `espera_do_proximo`) | — |
| RN-19 | Agendamento válido por plataforma, no futuro (margem mínima de 5 min) e dentro do horizonte de cada uma. | `domain/publicacao/agendamento.py` (`validar`) | — |
| RN-20 | **Teto de hashtags por plataforma**: 3 no YouTube Shorts, 5 no Reels, 5 no TikTok. A legenda do Reels não leva link. O que se **grava** tem teto 10; o corte por plataforma é feito na publicação. | `domain/publicacao/publicacao.py` (`adaptar`, `hashtags_max`, `link_na_legenda`); `domain/short/metadados_short.py` (`MAX_HASHTAGS`) | — |
| RN-21 | Ranking de lives = VPH + recência, normalizados min-max no lote. | `domain/live_candidata/ranking_lives.py` (`calcular_vph`, `calcular_recencia`, `normalizar_minmax`) | — |

## F. Imagem, áudio e render

| RN | Regra | Onde mora | Origem |
|---|---|---|---|
| RN-22 | Capa vertical 9:16 (1080×1920) com as três faixas dentro da faixa segura 3:4 (1344 px de altura). | `domain/corte/capa_tiktok.py` (`ALTURA_SEGURA`, `TOPO_SEGURO`) | — |
| RN-23 | Thumbnail codificada em 4:4:4 (`subsampling=0`), **sem** reduzir para 1280×720 — reduzir antes piora a nota. | `domain/thumbnail_encode.py` (`_codificar`, `preparar_para_youtube`) | — |
| RN-24 | Detecção de silêncio com parâmetros fixos: 0,6 s no proxy, 0,3 s no vídeo. Decisão de 04/09/2026: **não mexer**. | `infrastructure/render/ffmpeg_basic.py` (`_SILENCIO_DUR_PROXY`, `_SILENCIO_DUR_VIDEO`) | — |
| RN-25 | O filtro de render é **global** (Ajustes), não por projeto nem por corte. | `services/app_settings.py` (`filtro_global_padrao`) | I-023 |

## Divergências encontradas na conferência

O que o rascunho de 16/09 dizia e o código não diz mais — ou o contrário:

- **RN-01, RN-04, RN-05**: o rascunho descrevia transições espalhadas e o status
  `editado`. Desde a D-665 as transições têm dono no `domain/`, e `editado` foi
  removido (nada o atribuía; 0 cortes na PROD).
- **RN-20**: o docstring de `domain/short/metadados_short.py` diz "10 no Reels", mas
  quem aplica o teto é `domain/publicacao/publicacao.py`, com **5** para o Reels. A regra
  deste catálogo é a do código que aplica; o comentário está desatualizado.
