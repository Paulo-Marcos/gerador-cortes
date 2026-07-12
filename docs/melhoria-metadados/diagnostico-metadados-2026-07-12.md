# Diagnóstico e proposta — Etapa de Metadados do YouTube (D-342)

> **Data:** 2026-07-12 · **Demanda:** D-342 (`✨ feat` / #DEV)
> **Autor:** análise assistida por IA (mapa do código + pesquisa externa 2024–2026)
> **Status:** diagnóstico/proposta — **nada implementado ainda**. Aguarda decisão do dev
> sobre escopo antes de virar ondas de execução.

Este documento avalia a etapa de metadados (título, texto de capa, descrição/sinopse,
tags e hashtags), confronta o que temos hoje com as melhores referências atuais de
YouTube (2024–2026) e propõe ajustes de estrutura, conteúdo e produto. A forma atual
**não é definitiva** — o objetivo é elevar a etapa ao estado da arte editorial + SEO.

---

## 1. Método

1. **Mapa do código atual** — serviço, orquestração Claude, modelo de dados, UI e a
   *skill editorial* `metadados-expert` (corpo por canal no banco).
2. **Pesquisa externa** em duas frentes, priorizando fontes oficiais do YouTube,
   estudos de dados (Backlinko 1.3M vídeos) e educadores de referência (Paddy Galloway,
   vidIQ, Colin & Samir), com ceticismo ativo contra conselhos de SEO pré-2022 já
   obsoletos.
3. **Confronto** entre o que fazemos e o que a evidência recomenda, respondendo às
   perguntas explícitas do desenvolvedor.

---

## 2. Como funciona hoje

### 2.1 Pipeline
- Provedor real = **Claude CLI** (`claude -p`, modelo `sonnet`). O n8n **não** gera
  metadados (só sobraram comentários legados). Há um caminho **manual** (copiar/colar
  prompt) e um caminho externo de **thumbnail** (GPT capista).
- `claude_ia.gerar_metadados_via_claude()` resolve a skill `metadados-expert` (corpo por
  canal, tabela `editorial_skill`), monta o contexto do corte (título proposto, tema,
  número, resumo, **transcrição final = fonte de verdade**, histórico de títulos recentes)
  e devolve **um JSON**.
- `MetadadosService.importar_resultado_meta()` persiste
  ([metadados.py:308](../../backend/app/services/metadados.py)).

### 2.2 O que a skill produz hoje (contrato de saída)
```json
{
  "opcoes_titulo": ["", "", "", ""],
  "opcoes_texto_capa": ["", "", "", ""],
  "sinopse": "",
  "hashtags": ["", "", "", ""]
}
```
- **4 títulos**, um por família **A/B/C/D** (tese-síntese, conceito+consequência,
  pergunta-eixo, figura+ação). Alvo 55–60 chars, ≤9 palavras, frontload em 30 chars,
  sem subordinada, sem emoji. **Lista negra** de clickbait muito boa.
- **4 textos de capa**, 1–3 palavras, **proibido repetir a palavra-chave do título**,
  4 funções narrativas distintas.
- **sinopse**: gancho na linha 1 + 1–3 parágrafos, 60–180 palavras, SEO orgânico.
- **hashtags**: 4–6, ordem série → tema amplo → específico.

### 2.3 Como é persistido
- `descricao_youtube = sinopse + "\n\n" + creditos + "\n\n" + hashtags`
  ([metadados.py:324](../../backend/app/services/metadados.py)).
- **`tags_youtube` = a MESMA lista de hashtags** ([metadados.py:354](../../backend/app/services/metadados.py)).
  Ou seja: **não existe conceito de "tags" separado de "hashtags"** hoje. Um único array
  serve para os dois campos.
- `titulo_youtube` = `opcoes_titulo[0]`; `texto_capa` = `opcoes_texto_capa[0]` (+ emojis
  🔥/📖). Série recebe cor cíclica.

### 2.4 UI (`MetadataCard.tsx`)
- **Título YouTube**: linha de sugestões (4 opções) + input com contador `/100`.
- **Texto thumbnail**: linha de sugestões (4 opções) + input. **Sem contador nem
  validação de nº de palavras** (a regra "1–3 palavras" só vive na skill).
- **Descrição** e **Tags**: textareas. Tags separadas por vírgula. Sem limite/contagem.
- No header do card, título e texto de capa aparecem **empilhados** (o dev consegue
  conferir a complementaridade visualmente).

### 2.5 Locks relevantes (`.guia/locks/registry.yaml`)
| Arquivo | Travado? | Lock id |
|---|---|---|
| `backend/app/services/metadados.py` | **SIM** | `thumbnail-agent-prompt-livre` |
| `backend/app/routers/metadados.py` | **SIM** | `thumbnail-agent-prompt-livre` |
| `frontend/.../metadata/MetadataCard.tsx` | **SIM** | `thumbnail-agent-prompt-livre` + `thumbnail-paste-image` |
| `frontend/src/lib/api.ts` | **SIM** | (3 locks) |
| `backend/app/models.py` | **SIM** | `editor-cortes-stage-medallion` |
| `frontend/src/types/models.ts` | **SIM** | `editor-cortes-stage-medallion` |
| **`instance/.../editorial/metadados.md`** (corpo da skill) | **LIVRE** | — |
| **`examples/instance.example/editorial/metadados.md`** (template) | **LIVRE** | — |
| `backend/app/services/claude_ia.py` | **LIVRE** | — |
| `MetadataPage.tsx` / `MetadataModal.tsx` | **LIVRE** | — |

> **Consequência de escopo:** mexer só no **corpo da skill** (texto do prompt) é
> **100% livre** e não toca nenhum lock. Qualquer mudança de **estrutura de dados**
> (novos campos, chapters, split de sinopse) toca `metadados.py` + `models.py` +
> `MetadataCard.tsx` + `models.ts` — **todos travados**, exigindo `[unlock:]` autorizado.

---

## 3. O que diz a evidência (2024–2026) — síntese citada

### 3.1 Título
- **Comprimento:** o teto de 60 chars ainda é bom, mas o alvo real mudou para um
  **núcleo de ~48–50 chars auto-suficiente** (celular, notificações e feed cortam aí;
  70% do consumo é mobile). Tudo depois de ~50 é "bônus" que só desktop/busca mostram.
- **Frontload ainda vale** (keyword nos primeiros 30–40 chars ≈ +20% de rankeamento),
  **mas** ~60–70% do tráfego é Browse/Sugeridos (impulso, puxado pela thumbnail) e só
  ~15–40% é Busca. Logo: **gancho ganha a frente**; keyword entra tecida, salvo tema
  buscável (nome próprio, evento) onde frontload serve os dois.
- **Arquétipos que funcionam:** curiosity gap (loop aberto), especificidade/número
  concreto, contraste "A vs B", stakes/consequência, pergunta+payoff, **autoridade**
  (sobe CTR em nichos de confiança — política/filosofia é exatamente isso), pronomes
  ("você"/"eu").
- **Imposto do clickbait (2025, NOVO):** o YouTube passou a **remover** "egregious
  clickbait" — título/thumb que promete o que o vídeo não entrega — e **os exemplos
  oficiais são políticos** ("The President Resigned!"). Nosso nicho está no alvo. A
  lista negra atual da skill já cobre bem isso.
- **Título ↔ thumbnail = complementares, não redundantes** (guia oficial do YouTube).
  Thumb = provocação/curiosidade; título = contexto/payoff específico. **Não repetir.**

**Fontes:** [YouTube Help — Thumbnail & title tips](https://support.google.com/youtube/answer/12340300) ·
[Google Blog — clickbait enforcement](https://blog.google/intl/en-in/products/platforms/strengthening-enforcement-against-egregious-clickbait-on-youtube/) ·
[vidIQ — Title Flip](https://vidiq.com/blog/post/YouTube-Title-Flip-SEO-Framework/) ·
[Paddy Galloway — New Rules (Colin & Samir)](https://www.colinandsamir.com/resources/the-new-rules-of-youtube-from-paddy-galloway) ·
[Backlinko — 1.3M vídeos](https://backlinko.com/youtube-ranking-factors)

### 3.2 Texto de capa (thumbnail)
- **Tendência = menos texto:** 0–4 palavras, ideal **1–2**, muitas vezes **zero**
  (rosto/expressão carrega). Vantagem cresce no mobile.
- **Redundância é o erro clássico:** manter texto de capa **só se disser algo
  diferente** do título. Se seria substring/paráfrase do título → **suprimir** e deixar
  a imagem carregar. Isso responde **diretamente** à pergunta do dev.

**Fontes:** [Thumbnail-Title Relationship](https://yt-thumbnail.com/blog/thumbnail-title-relationship) ·
[thumbnailtest — Text on thumbnail 2026](https://thumbnailtest.com/guides/text-on-youtube-thumbnail/)

### 3.3 Tags
- **Posição OFICIAL do YouTube:** *"tags play a minimal role in your video's discovery"* —
  úteis **só** para conteúdo comumente **soletrado errado**. Hierarquia: thumbnail+título
  > descrição > áudio/legenda > **tags (mais baixo)**. Backlinko: tags não aparecem como
  fator relevante. **Excesso de tags = risco de spam.**
- Uso sensato: **5–8 tags** = {nomes próprios com grafia variável (Nietzsche/Nietzche,
  Foucault/Foucalt) + 1–2 tags de marca/série}. Não gastar esforço de modelo nisso.

**Fontes:** [YouTube Help — Add tags](https://support.google.com/youtube/answer/146402) ·
[Backlinko](https://backlinko.com/youtube-ranking-factors) · [TubeBuddy — Truth about tags](https://www.tubebuddy.com/blog/youtube-tags-the-truth/)

### 3.4 Hashtags
- Até **3** aparecem acima do título (YouTube escolhe as "mais engajadas"). **Cap real
  = 60** (acima disso ignora TODAS — o número "15" que circula é desatualizado).
- Prática: **3–5 hashtags deliberadas**, as 3 primeiras escolhidas de propósito.

**Fonte:** [YouTube Help — Hashtags](https://support.google.com/youtube/answer/6390658)

### 3.5 Descrição
- **Acima da dobra = tudo:** só os **~150 chars (desktop) / ~100 (mobile)** iniciais
  aparecem antes do "…mais". Linha 1–2 = **gancho humano com a keyword primária**.
- **Mito derrubado:** descrição keyword-rich **NÃO rankeia** para a keyword (Backlinko).
  Ela ajuda termos relacionados/sugeridos e o **espectador**. Escreva para humano.
- **Comprimento útil:** 200–350 palavras de conteúdo real; descrição única por vídeo.
- **Créditos/links/boilerplate = abaixo da dobra** (ou em comentário fixado).

**Fontes:** [YouTube Help — Descriptions](https://support.google.com/youtube/answer/12948449) ·
[Backlinko](https://backlinko.com/youtube-ranking-factors)

### 3.6 Chapters / timestamps — **a maior lacuna**
- Regras oficiais: 1º timestamp **`00:00`**, **≥3** timestamps crescentes, **≥10s** cada.
- Para vídeo analítico longo, é o **maior alavanca de descoberta que falta**: cada
  capítulo vira "key moment" na busca do YouTube **e do Google** → um vídeo rankeia para
  várias queries. Já temos os timestamps das cenas/cortes.

**Fonte:** [YouTube Help — Video Chapters](https://support.google.com/youtube/answer/9884579)

### 3.7 Modelo mental de "packaging"
- Título + thumbnail = **uma unidade só**, planejada e **testada junta**. É a alavanca
  de maior ROI do canal. YouTube Studio hoje faz **A/B de até 3 títulos e 3 thumbnails**,
  otimizando por **watch-time** (não CTR bruto). Gerar **volume** de pares e testar.

**Fonte:** [YouTube A/B testing 2026](https://outlierkit.com/resources/youtube-ab-testing-3-variants-guide-2026/)

---

## 4. Diagnóstico — respostas diretas às perguntas do dev

### ❓ "A estrutura hoje está boa? Faz sentido repetir o título e o texto thumbnail?"
**A estrutura está BOA na intenção, com uma lacuna grande e alguns ajustes finos.**
- **Não há repetição por design:** a skill **já proíbe** o texto de capa repetir a
  palavra-chave do título (seção 2 da `metadados.md`). Isso está **alinhado** com a
  melhor prática (complementaridade). ✅
- **Porém falta guard-rail:** nada impede, na prática, a IA ou o editor de deixar
  título e capa dizendo a mesma coisa. Falta (a) uma **checagem de redundância**
  explícita e (b) a **opção de capa vazia** ("deixe a imagem carregar") quando não
  houver soco não-redundante — hoje somos obrigados a ter 4 textos de capa sempre.
- **Maior lacuna estrutural:** **não geramos chapters/timestamps** — o item de maior
  impacto de descoberta para vídeo longo. E a **sinopse é um bloco único**, sem separar
  o **gancho acima-da-dobra (≤150 chars)** do corpo.

### ❓ "Os tipos dos títulos estão bons? Podem melhorar?"
**Bons e acima da média; dá para modernizar.**
- As 4 famílias (A/B/C/D) são um bom sistema e a lista negra é **excelente** (já
  antecipa o crackdown de clickbait de 2025). ✅
- Melhorias: (1) alvo de comprimento → **núcleo de ~50 chars auto-suficiente** (hoje o
  alvo 55–60 mira o texto inteiro, não o núcleo mobile); (2) **rotular cada família por
  intenção de tráfego** (Browse/curiosidade vs. Busca/keyword) para o editor escolher
  conscientemente; (3) acrescentar padrões comprovados que faltam — **especificidade/
  número concreto**, **contraste A-vs-B**, **autoridade** (forte no nicho); (4) opcional:
  documentar a tática **"Title Flip"** (lançar com curiosidade → trocar para keyword
  após 48–72h) como recomendação de operação.

### ❓ "Valide a forma das tags e do resumo."
- **Tags:** hoje **tags == hashtags** (mesmo array). É desperdício e desalinhado. O
  YouTube diz que tags têm **papel mínimo**. Proposta: **separar** os conceitos e
  reposicionar `tags_youtube` para **5–8 termos** = nomes próprios soletráveis errado +
  marca/série; **parar de otimizar** tags. Hashtags viram um campo próprio de **3–5**.
- **Resumo (sinopse):** hoje é um bloco. Proposta: **dividir** em **gancho
  acima-da-dobra (≤150 chars, com keyword)** + **corpo (200–350 palavras)**, e montar a
  descrição final como `gancho + corpo + chapters + créditos/links + hashtags`.

---

## 5. Proposta

### 5.1 Novo contrato de saída da skill `metadados-expert`
```json
{
  "opcoes_titulo": [
    {"texto": "", "familia": "A", "trafego": "browse|busca"},
    {"texto": "", "familia": "B", "trafego": "browse|busca"},
    {"texto": "", "familia": "C", "trafego": "browse|busca"},
    {"texto": "", "familia": "D", "trafego": "browse|busca"}
  ],
  "opcoes_texto_capa": ["", "", ""],        // 0–3 palavras; pode vir "" (capa sem texto)
  "gancho": "",                              // ≤150 chars, acima da dobra, com keyword
  "sinopse": "",                             // corpo 200–350 palavras
  "chapters": [                              // 1º em 00:00, ≥3, ≥10s, títulos com keyword
    {"inicio": "00:00", "titulo": ""}
  ],
  "hashtags": ["", "", ""],                  // 3–5, ordem série→amplo→específico
  "tags": ["", "", ""],                      // 5–8: nomes soletráveis + marca (SEO mínimo)
  "keywords": ["", "", ""]                   // interno: primária + 3–5 long-tail (não publicado)
}
```
> **Compat.:** o contrato antigo (`opcoes_titulo` como array de strings) pode ser mantido
> como fallback tolerante no import para não quebrar cortes já gerados.

**Mudanças-chave vs. hoje:**
1. **`gancho` separado da `sinopse`** (acima-da-dobra distinto do corpo).
2. **`chapters`** (novo) — maior ganho de descoberta. Deriva dos timestamps das cenas.
3. **`tags` ≠ `hashtags`** — tags viram SEO mínimo (soletração/marca); hashtags 3–5.
4. **`texto_capa` pode ser vazio** — legitima "imagem sem texto" e evita redundância.
5. **`keywords` interno** — orienta título/gancho/chapters sem poluir a saída publicada.
6. **Metadado de intenção de tráfego** por título — ajuda escolha e futuro A/B.

### 5.2 Reescrita do corpo editorial (`metadados.md`) — pontos
- Alvo de título → **núcleo ~50 chars auto-suficiente** (mantendo teto 60).
- Famílias rotuladas por **intenção de tráfego**; acrescentar padrões
  especificidade/contraste/autoridade ao repertório (sem inflar de 4 opções).
- **Regra de complementaridade dura + permissão de capa vazia** + checagem
  anti-redundância no checklist auto-aplicado.
- Nova seção **CHAPTERS** com as regras oficiais e o estilo "beats intrigantes"
  ("Por que Hobbes erra aqui") em vez de índice seco.
- Nova seção **GANCHO** (≤150 chars) separada de **SINOPSE** (corpo).
- Seção **TAGS** reposicionada (SEO mínimo) e **HASHTAGS** reduzida a 3–5.
- Manter/expandir a lista negra (já é um diferencial).

### 5.3 Persistência (`metadados.py` — **LOCKED**)
- Montar `descricao_youtube = gancho + "\n\n" + sinopse + "\n\n" + chapters +
  "\n\n" + creditos + "\n\n" + hashtags`.
- Persistir `tags_youtube` a partir do **novo** array `tags` (não mais dos hashtags).
- Import tolerante ao contrato antigo (strings) e ao novo (objetos).
- **Precisa de `[unlock:thumbnail-agent-prompt-livre]` autorizado.**

### 5.4 Modelo de dados (`models.py` — **LOCKED**) — só se guardarmos campos novos
- Opção enxuta: **não** criar colunas novas; derivar tudo dentro de
  `descricao_youtube` e reusar `opcoes_titulo`/`opcoes_texto_capa`. (Evita tocar lock de
  modelo/migração.)
- Opção completa: colunas `gancho`, `chapters_json`, `keywords_json` → migração +
  `[unlock:editor-cortes-stage-medallion]`. **Decisão do dev.**

### 5.5 UI (`MetadataCard.tsx` — **LOCKED**)
- Contador de palavras/limite no **texto de capa** (regra 0–3 palavras) + botão
  "sem texto".
- Contador do **gancho** (≤150) com marca visual da dobra.
- Bloco de **chapters** (lista editável) e preview da descrição montada.
- **Precisa de `[unlock:thumbnail-agent-prompt-livre]` + `thumbnail-paste-image`.**

---

## 6. Ondas de execução propostas (granularidade fina)

> Ordenadas por **ROI × risco de lock**. O dev escolhe até onde ir.

**Onda 1 — Editorial puro (SEM locks, baixo risco, alto valor).**
Reescrever `examples/instance.example/editorial/metadados.md` **e** o corpo por canal de
PROD: título (núcleo 50 chars + famílias por tráfego + novos padrões), complementaridade
dura + capa vazia, seção GANCHO, seção CHAPTERS, TAGS reposicionada, HASHTAGS 3–5,
checklist. **Entrega a maior parte do ganho de qualidade sem tocar nenhum lock.**
> Ressalva: campos novos (`gancho`, `chapters`, `tags`) só "aparecem" de fato quando a
> persistência (Onda 2) os consumir. Na Onda 1 isolada, dá para já melhorar
> título/capa/sinopse/hashtags dentro do contrato atual.

**Onda 2 — Persistência (LOCK: `metadados.py`).**
Novo contrato de import (tolerante), montagem da descrição com gancho+chapters,
`tags` separado de `hashtags`. Requer unlock autorizado.

**Onda 3 — UI (LOCK: `MetadataCard.tsx`).**
Contadores (capa/gancho), botão "sem texto", editor de chapters, preview da descrição.
Requer unlock autorizado.

**Onda 4 — Modelo/colunas (LOCK: `models.py`) — OPCIONAL.**
Só se quisermos persistir gancho/chapters/keywords em colunas próprias (migração).

**Fora de escopo imediato (registrar como backlog):** comentário fixado gerado,
sugestão de end-screen/CTA, integração com o A/B nativo do Studio.

---

## 7. Riscos e não-regressão
- **Cortes já gerados**: import precisa aceitar o contrato antigo → **fallback tolerante**
  obrigatório.
- **Prefixo de leitura / emojis 🔥📖 / cor de série**: lógica atual em `importar_resultado_meta`
  deve ser preservada.
- **SKILLS = PROD**: a melhoria mira o corpo do canal de PROD (customização), não só o
  template genérico. Ver memória `skills_prod_funcionalidades_dev`.
- **Teste**: `domain/`/`services/` novos nascem com teste de caminho feliz; rodar gate
  completo (ruff check + ruff format --check + pytest) antes de qualquer push backend.

---

## 8. Decisões que preciso do dev
1. **Profundidade:** só Onda 1 (editorial, sem locks) agora, ou já Ondas 1–3 (persistência
   + UI, com unlocks)? Onda 4 (colunas) entra?
2. **Chapters:** entram nesta demanda (recomendo **sim** — maior ROI) ou viram demanda
   à parte?
3. **Texto de capa vazio:** aceitamos legitimar capas **sem texto**?
4. **Tags:** concordamos em **separar de hashtags** e rebaixar a SEO mínimo (nomes
   soletráveis + marca)?
5. **PROD vs template:** aplico a reescrita no corpo do canal de PROD **e** no template
   genérico `instance.example`?
