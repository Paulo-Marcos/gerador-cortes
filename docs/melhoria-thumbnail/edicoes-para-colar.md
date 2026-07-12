# D-343 — Edições prontas para colar na UI `/canais`

Aplicar no canal **`default`** (produção). São **2 colagens obrigatórias** (corpo + scaffold do
Capista) e **1 opcional** (metadados-expert). Cada campo é editado inteiro na UI de skills.

Os textos finais completos, prontos para colar **inteiros**, estão em (não versionados — contêm a
identidade do canal):
- Corpo do Capista → `…/scratchpad/PROD_thumbnail_corpo.md`
- Scaffold do Capista → `…/scratchpad/PROD_thumbnail_scaffold.txt`

Abaixo, só o que **mudou** (para conferência). Nada da identidade do Sapo, cena, elenco, luz,
anti-repetição etc. foi tocado — a mudança é **cirúrgica no texto da arte**.

---

## 1. Capista — `thumbnail-prompt-expert` · CORPO

### Trocado: a §11 inteira (era "TEXTO — MANCHETE + APOIO", 11.1–11.12)
Antes obrigava "MANCHETE = titulo_youtube POR INTEIRO … 2-3 linhas". **Agora:**

- **§11.1** — a arte carrega **UM gancho**; o **título completo NÃO entra na arte** (vive fora da
  miniatura); arte e título são **complementares, não redundantes**.
- **§11.2** — o gancho **é o `texto_capa`**; estilo no **padrão de boas práticas do YouTube**;
  **comprimento flexível**; tem de **parar o scroll e se sustentar sozinho**; pode reescrever o
  `texto_capa` como gancho mais forte se vier fraco, sem inventar fato.
- **§11.3** — peso BLACK/HEAVY, contorno+sombra, alto contraste, **zona de baixo ruído**.
- **§11.4** — **renderização literal**: texto entre aspas, CAIXA ALTA, cor/peso/posição explícitos.
- **§11.5–11.9** — tipografia variável, layout livre, emoji junto ao gancho, diegético só quando é
  o tema, anti-slide ("um gancho, uma leitura").

### Trocado: 4 itens do CHECKLIST FINAL
As perguntas "a manchete reproduz o título por INTEIRO?" viraram:
- *O texto da arte é UM gancho de impacto (padrão YouTube), que para o scroll e se sustenta
  sozinho — e NÃO o título inteiro nem um resumo dele?*
- *O gancho complementa o título (não o duplica)?* + preserva `texto_capa`/emoji + é overlay
  literal legível em 160px.

### Trocado: bloco `TEXT OVERLAY` do PROMPT-MODELO
`HEADLINE (título inteiro) + SUPPORT` → **`HOOK` único** (gancho, caixa alta, comprimento
flexível, emoji junto) + `Placement` em zona de baixo ruído. E o `AVOID` passou a proibir
"colocar o título inteiro/resumo multi-linha na arte".

### Trocado: linha `[VARIATION_TAGS]` (chaves mantidas p/ não quebrar o parser de padrões)
`layout_texto="geometria do gancho na arte"` · `apoio_layout="posição do gancho relativa ao
sujeito/rosto"`.

---

## 2. Capista — `thumbnail-prompt-expert` · SCAFFOLD (item 5)

> 5) TEXTO: a arte carrega UM gancho de atenção — o texto_capa (ou uma frase-soco curta e fiel ao
> corte que para o scroll e se sustenta sozinha), no padrão de boas práticas de thumbnail do
> YouTube; comprimento flexível. O título do vídeo NÃO entra na arte (vive fora da miniatura); arte
> e título são COMPLEMENTARES, não redundantes. PROIBIDO reproduzir o título inteiro ou virar
> resumo do título. Declare o texto LITERAL entre aspas, CAIXA ALTA, peso BLACK/HEAVY,
> contorno+sombra e alto contraste, em zona de baixo ruído (sem competir com rosto/objeto central).
> Emoji 🔥/📖 só junto ao gancho, nunca objeto da cena. Sem retângulo sólido nos 15% inferiores.
> Anti-slide (sem lista de tópicos, cards ou tags).

*(Placeholders e o marcador `VARIATION_TAGS` intactos — o guardrail continua passando.)*

---

## 3. (Opcional) metadados-expert · CORPO · §2.1 — deixar o `texto_capa` carregar a arte sozinho

O `texto_capa` já é gerado como gancho complementar — ótimo. Como agora ele é **o único texto da
capa**, vale afrouxar o limite e reforçar que ele se sustenta sozinho. Trocar em **§2.1**:

- `- **1 a 3 palavras.** Quatro só em casos excepcionais…`
  → `- **1 a 5 palavras (comprimento flexível).** Prefira o mais curto que ainda pare o scroll.`
- Acrescentar um bullet: `- **É o único texto da capa** — precisa chamar atenção e fazer sentido
  sozinho, sem depender do título (que aparece fora da arte).`

Mantém a regra "não repita palavra-chave do título" (é o que garante a complementaridade).

---

## Como validar (antes de assumir como padrão)
1. Colar 1+2 no canal `default`.
2. Gerar o prompt de thumbnail de **3–5 cortes variados** e levar ao ChatGPT/Microsoft.
3. Conferir: o texto na arte é **só o gancho** (nunca o título inteiro)? Chama atenção? Legível em
   miniatura? O título completo continua no campo do YouTube?
4. Se algum gancho sair fraco/críptico, aí sim aplicar a colagem opcional (3) no metadados-expert.
