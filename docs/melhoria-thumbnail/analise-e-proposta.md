# D-343 — Avaliação da etapa de prompt de thumbnail

> Análise minuciosa da geração de thumbnails (skill + prompts + modelo de imagem),
> validada contra as melhores práticas de mercado (2026) e cruzada com os dados de
> produção do canal `default`. **Nada aqui é definitivo** — é a base para decidir os
> ajustes.

---

## 1. Como funciona hoje (mapa da esteira)

```
Corte (transcrição, tema, resumo)
  └─ metadados-expert (Claude/Opus) → titulo_youtube + texto_capa (opções)
        └─ thumbnail-prompt-expert "Capista" (Claude/Opus)      ← ESCREVE o prompt de imagem
              input: tema, titulo_youtube, texto_capa, resumo, transcrição,
                     histórico visual (anti-repetição), hints do editor, emojis 🔥/📖
              output: linha [VARIATION_TAGS] + prompt final em inglês (~6.000 chars)
                    └─ Gemini `gemini-2.5-flash-image` (Nano Banana v1)  ← RENDERIZA a imagem
```

Peças reais (fonte da verdade):
- **Corpo da skill (expertise)** — `editorial_skill.corpo` na `settings.db`, canal `default`
  (27 KB, 532 linhas, **fortemente customizado** — NÃO é o template genérico).
- **Scaffold (contrato de saída)** — `editorial_skill.scaffold` (2,8 KB).
- **Modelo que escreve o prompt** — Claude `opus` (`claude_model_thumbnail`).
- **Geração da imagem** — na prática, **MANUAL**: o dono leva o prompt do Capista para o
  **ChatGPT (GPT-image/DALL·E)** e o **Microsoft Designer/Bing (DALL·E 3)**. O caminho automático
  Gemini (`gemini-2.5-flash-image`, hard-coded em `gemini_client.py:67`) existe mas **não é o
  fluxo real** → trocar o modelo Gemini **não** resolve o problema. O único lever sob controle é
  o **prompt/skill** (que serve para qualquer gerador). *(corrige a hipótese P2 original.)*
- Templates legados `PROMPT_GERAR_THUMBNAIL*` em `backend/app/canal_config.py.example`
  alimentam só os fluxos manuais "agente"/"agente livre" (o custom GPT), **não** o caminho Claude.

---

## 2. O diagnóstico central: por que "os textos saem em branco quando há muito destaque"

O problema **não é aleatório nem só do modelo** — está prescrito na skill. O corpo do Capista
manda, em quatro lugares diferentes, colocar **o título do YouTube INTEIRO dentro da arte**:

- §11.5: *"MANCHETE ← o `titulo_youtube` POR INTEIRO … PROIBIDO cortar o título … Se o título
  for longo, a manchete continua longa (quebrar em 2-3 linhas)"*
- §11.6, Checklist (*"Lendo só a manchete, dá para reconhecer o título completo?"*) e o
  PROMPT-MODELO (*"HEADLINE: o titulo_youtube POR INTEIRO em caixa alta … pode ocupar 2-3 linhas"*).
- O scaffold repete a mesma regra (item 5).

**Nos dados de produção, os títulos têm mediana de 9 palavras (até 17).** Ou seja: cada
thumbnail está sendo instruída a renderizar, dentro da imagem, **~9 palavras de manchete em
2-3 linhas + o apoio (texto_capa, ~3 palavras) + emoji**, sobre uma cena editorial deliberadamente
densa (profundidade obrigatória, múltiplas figuras, luz dramática).

Isso colide de frente com como os geradores de imagem funcionam. A pesquisa de mercado é
explícita: o modelo tem um **"orçamento de renderização" limitado** — ao tentar compor uma cena
rica **e** desenhar texto com precisão ao mesmo tempo, *"o texto costuma ser a vítima"*. Quanto
**mais destaque/complexidade visual**, menos orçamento sobra para o texto → **texto em branco,
cortado ou ilegível**. É exatamente o sintoma relatado ("saem em branco se muito destaque").

Some-se a isso o modelo em uso: `gemini-2.5-flash-image` (Nano Banana v1) tinha taxa de falha
de texto ~50% antes do Nano Banana **Pro** (nov/2025). O `AVOID: illegible text` no fim do prompt
não resolve — é um pedido contraditório: **não dá para exigir "título inteiro em 2-3 linhas" E
"texto legível" ao mesmo tempo.**

**Causa-raiz, em ordem de impacto:**
1. **Excesso de texto exigido** (título inteiro + apoio + emoji) — o maior fator, e é decisão da skill.
2. **Modelo mais fraco** para texto (`flash-image` v1 em vez do Pro).
3. **Cena deliberadamente densa** disputando o orçamento de texto.

---

## 3. O que o mercado diz (2026) — e onde a esteira contraria

| Best practice (2026) | Fonte | Situação hoje |
|---|---|---|
| **Texto da thumb ≤ 4-5 palavras** (< 4 palavras → +30% CTR); regra dos 3 segundos | freeimages, ampifire, thumbmagic | ❌ Manchete = título inteiro (~9 palavras) + apoio |
| **Título e thumbnail COMPLEMENTARES, não redundantes** (curiosity gap) | red11media, tubics, thumbnailtest | ❌ Skill exige o título **duplicado** dentro da arte |
| **Minimalismo > poluição** (−cluttered → +18% CTR); "um sujeito, uma mensagem" | banana/study 50k thumbs | ⚠️ Skill empurra profundidade + múltiplas figuras + símbolos |
| **Rosto + emoção real** (+35% CTR faces; +20-30% emoção) | ampifire, alici | ✅ Já forte (microexpressões do Sapo, elenco) |
| **Alto contraste sujeito×fundo** | ampifire | ✅ Já previsto (peso black, contorno+sombra) |
| **60%+ do consumo é mobile** (legibilidade em ~160px) | ampifire | ⚠️ Teste de 1s existe, mas o excesso de texto o inviabiliza |
| **Modelo com renderização de texto confiável** | Google/Nano Banana Pro docs | ❌ Usa `flash-image` v1 |

**Resposta direta à sua pergunta ("título do YouTube + texto thumbnail — está bom?"):**
A **estrutura de dois campos é ótima e é exatamente o que o mercado recomenda** — desde que cada
um cumpra o seu papel:
- **Título do YouTube** = contexto completo, nomes, conceito → vive **FORA da arte** (é o campo de
  título do vídeo, lido abaixo da thumb).
- **Texto da capa (texto_capa)** = **um** gancho curto, emocional/curioso, ≤ 4 palavras → é o
  **único** texto **dentro da arte**.

O bug não é ter dois campos; é a skill **forçar os dois dentro da imagem e ainda fazer o título
ser o texto dominante**. Ironicamente, o `texto_capa` que o sistema já gera é **excelente** para
thumb ("ESCALA MUDA TUDO", "QUEM VEIO ANTES?", "A CONTA NÃO FECHA") — são exatamente os ganchos de
curiosidade que deveriam mandar. Hoje eles são rebaixados a "apoio" enquanto o título de 9 palavras
domina.

---

## 4. Proposta de ajustes (ranqueada por ROI)

### P1 — Inverter a regra de texto na arte *(maior impacto, custo ~zero)*
Reescrever a §11 do corpo do Capista e o item 5 do scaffold:
- O **texto_capa (≤ 4 palavras) passa a ser a ÂNCORA ÚNICA de texto** na arte.
- **Remover** o mandato "manchete = título inteiro". O título **não** entra na arte (ou entra, no
  máximo, como um *kicker* de 1 linha ≤ 3 palavras derivado do gancho — opcional).
- Atualizar Checklist, PROMPT-MODELO (`HEADLINE`/`SUPPORT` → um único `TEXT`), e o
  `[VARIATION_TAGS]` (o eixo vira "texto único").
- Efeito duplo: alinha ao mercado (curiosity gap, ≤4 palavras) **e** devolve orçamento de
  renderização → acaba o texto em branco.

### P2 — ~~Subir o modelo de imagem~~ → **DESCARTADO** (geração é manual)
A geração real é manual no ChatGPT + Microsoft; o modelo Gemini do backend não está no fluxo.
Logo, o texto em branco **não** se resolve trocando modelo — resolve-se no **prompt** (P1/P3/P4),
que vale para qualquer gerador. Princípio confirmado: DALL·E 3 (ChatGPT/Bing) e GPT-image também
degradam texto sob carga alta — string curta, explícita e única rende bem; frase longa em 2-3
linhas sai borrada/em branco. *(Se um dia quiser automação, aí sim vale Nano Banana Pro.)*

### P3 — Instrução de texto explícita + "zona limpa" reservada *(médio impacto)*
No prompt final, especificar o texto do jeito que os geradores rendem bem: **string exata entre
aspas, caixa alta, peso/cor/posição** ("render the text 'ESCALA MUDA TUDO' in bold white
condensed sans-serif, upper area, thick dark outline") e **reservar uma zona de baixo ruído**
para o texto (a cena densa não pode invadir a área do texto). Ataca diretamente o item 3 da
causa-raiz.

### P4 — Aliviar a pressão por "cena densa" quando competir com o texto *(médio)*
A skill hoje exige profundidade + múltiplas figuras + símbolos. Adicionar hierarquia: **clareza
em 1s e legibilidade do gancho vêm antes da densidade**. "Um sujeito, uma mensagem" como default;
elenco múltiplo só quando a tese exige.

### P5 — Fechar o loop de avaliação *(baixo esforço, alto valor de aprendizado)*
- Os critérios de avaliação (`fidelidade, clareza, beleza, impacto, honestidade`) **não medem
  legibilidade do texto nem "parou o scroll"**. Adicionar **`legibilidade`** (texto saiu limpo e
  lível em 160px?) como critério — é o sintoma que estamos combatendo.
- Apenas 12 avaliações existem e **nenhuma** tem notas por critério preenchidas → a análise de
  padrões roda "às cegas". Vale um empurrão de UX para pontuar.
- Opcional: cruzar `[VARIATION_TAGS]` × `youtube_video_stats` (views, avg-view %) para ver o que
  performa. Ressalva: **CTR/impressões não estão disponíveis** na API pública, então "performance"
  é proxy (views, retenção, inscritos).

### P6 — Sincronizar os templates legados e o default genérico *(higiene)*
`PROMPT_GERAR_THUMBNAIL*` (canal_config.py.example) e o default genérico
(`examples/instance.example/editorial/thumbnail.md`) carregam **o mesmo bug do título inteiro** —
atualizar para consistência e para o onboarding de novos canais já nascer correto.

---

## 5. Decisões que dependem de você

1. **Estratégia de texto na arte** (P1): só o gancho curto (recomendado) / gancho + kicker curto /
   manter título inteiro.
2. **Trocar o modelo de imagem** para Nano Banana Pro (P2): sim / manter / tornar configurável e
   testar A/B antes.
3. **Escopo de aplicação**: aplicar já no canal `default` de PROD (skills = PROD) ou deixar como
   proposta e você valida cada edit.

## 6. Riscos / notas
- Editar o corpo/scaffold do Capista é edição de **dados no banco (settings.db) via UI/API**, não
  de arquivo de código — não mexe em arquivo travado. `metadados.py` está travado
  (`thumbnail-agent-prompt-livre`), mas as mudanças-núcleo não precisam tocá-lo.
- Trocar o modelo Gemini muda custo por imagem (de ~grátis/baixo para ~US$ 0,13). Barato no
  volume atual, mas é uma decisão de custo.
- Mudança de texto na arte é **não-regressiva por natureza** (some texto ilegível), mas convém
  gerar 3-5 capas de teste e avaliar antes de assumir como padrão.

---

### Fontes de mercado
- YouTube thumbnails 2026 (≤4-5 palavras, faces, contraste, minimalismo): freeimages, ampifire,
  thumbmagic, alici, tubics.
- Complementaridade título×thumb (curiosity gap): red11media, tubics, thumbnailtest.
- Renderização de texto em IA (orçamento de renderização, two-step, Nano Banana Pro):
  Google Cloud "Ultimate prompting guide for Nano Banana", blog.google Nano Banana Pro,
  apiyi text-rendering guide, openrouter/pricepertoken (modelo/preço).
