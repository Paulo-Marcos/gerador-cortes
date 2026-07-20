# Pedido de design v2 - 3 areas que ficaram "datadas" apos o D-396

Contexto: implementamos a AUDITORIA-v2 (Bruto + Revisao final) e o Paulo notou,
ao comparar com o protótipo, que 3 outras areas do app parecem visualmente mais
antigas que o resto do shell Workbench. Investigamos cada uma no codigo antes
de escrever este pedido - aqui esta o que JA sabemos, para nao repetir trabalho.

## 1. Pos-producao (Cenas + Layout YouTube) - densidade visual

**Prints:** `v2-pos-cenas-densidade.jpg`, `v2-pos-layout-youtube-densidade.jpg`

O que ja esta feito: os paineis CENAS e LAYOUT YOUTUBE ja viraram paineis
retrateis (PanelShell) dentro do shell Workbench, com layout responsivo e
tokens `--wb-*` (confirmamos zero cor hardcoded no código). O que NAO esta
feito: o protótipo `Workbench 1c.dc.html` (secao "ABA POS", por volta da linha
323-419) mostra uma versao BEM mais simples dessas telas do que a
funcionalidade real do app (que tem padroes de cena, densidade/cobertura,
menu avancado, deteccao de regioes etc. - tudo isso e real e deve ser
mantido). Ou seja: o protótipo atual não é detalhado o bastante pra guiar um
restyle de densidade/tipografia como foi feito no Bruto (D-396). Precisamos de
uma auditoria tipo AUDITORIA-v2, mas para estas 2 telas, no mesmo formato
(secao por secao, arquivo-alvo, valores CSS concretos) - preferencialmente
olhando as capturas reais (`v2-pos-*`) em vez so do protótipo simplificado.

Tambem reparamos que a barra de steps da Pos usa rotulos "Metadados / Cenas /
Validar / Renderizar" (4 passos REAIS e clicaveis, cada um leva a uma acao
diferente), enquanto o protótipo mostra "1 Bruto / 2 Cenas / 3 Grade / 4
Final" (rotulos ilustrativos antigos). Achamos que os rotulos reais fazem mais
sentido funcionalmente (nao sao so ilustrativos) - avaliem se vale redesenhar
SO a aparencia desses steps (cores/tipografia) mantendo os 4 rotulos reais,
ou se preferem outra estrutura.

## 2. Modal de metadados rapido - redesign opcional

**Print:** `v2-modal-metadados.jpg`

O `DE-PARA.md` original (secao 6) marcou este modal explicitamente como
[REUSAR] - ou seja, a decisao anterior foi NAO redesenhar. O Paulo viu o modal
e achou que ele destoa visualmente do resto (cantos/paddings/tipografia mais
"genericos" que o padrao denso do Bruto). Perguntamos: querem manter a decisao
original de reuso, ou preferem que a gente aplique o mesmo tratamento visual
(tokens, densidade, tipografia JetBrains Mono nos labels) que foi aplicado no
resto do Workbench? Se sim, um mini-guia de 3-4 linhas (cores dos botoes,
tamanho de fonte dos labels, padding) ja e suficiente - nao precisa de uma
auditoria completa como a do Bruto.

## 3. Workspace do projeto - botoes de acao

**Print:** `v2-workspace-botoes.jpg`

O header (thumb 120px + chips de pipeline) ja foi redesenhado corretamente
(confirmado no código, `ProjetoDetalhePage.tsx`). O que ficou de fora foi a
linha de botoes de acao ("Abrir no YouTube", "Refazer transcricao", "Analise
IA", "Auditar analise", "Gerar trechos", "Publicar em massa") - o DE-PARA
tambem marcou a maioria destes como [REUSAR]. Mesma pergunta do item 2: still
querem manter esses botoes como estao (decisao original), ou querem que a
gente modernize a aparencia deles (viram botoes-icone compactos como os do
Bruto, por exemplo)? O Paulo comentou que, se for so reuso mesmo, quer
melhorar essa parte - entao um mini-guia rapido tambem resolve aqui.

## Como responder

Para o item 1 (o mais trabalhoso), se puderem seguir o formato da
AUDITORIA-v2.md (secao por secao, arquivo-alvo citado, valores CSS concretos)
num arquivo `AUDITORIA-v3-pos-producao.md`, o Claude Code já sabe seguir esse
padrão para implementar direto. Para os itens 2 e 3, uma resposta mais curta
(pode ser só neste mesmo arquivo, como comentário) já resolve, já que são
mudanças pontuais de estilo em componentes que já existem.

---

# RESPOSTA DO DESIGN — 19/07/2026

Auditoria completa do item 1 em
`design_handoff_workbench/AUDITORIA-v3-pos-producao.md`. Resumo + itens 2 e 3:

## Item 1 (Cenas + Layout YouTube + steps)

Descoberta ao auditar o código: **CenasPanel, CenaItem, YoutubeLayoutPanel e
PosTopbarExtra já estão no padrão denso do Bruto** (replicam v3_pos.jsx, com
as decisões do Paulo). O que datava a Pós eram os **primitivos
compartilhados**: `ui/modal.tsx` (tokens legados surface/text-100/accent-500),
`ui/input.tsx`, `ui/card.tsx` e ~6 stragglers pontuais. A AUDITORIA-v3
canoniza os valores já implementados (§1–3) e lista as trocas restantes
(§4–5) com arquivo e linha.

**Steps:** manter os 4 rótulos reais (Metadados/Cenas/Validar/Renderizar) —
são funcionais, e a aparência atual do PosStepperBar já está correta
(valores canônicos no §3). O protótipo é que será atualizado.

Obs.: as capturas `v2-pos-*.jpg` chegaram corrompidas (decodificam em
branco). Reenviem em PNG se quiserem validação visual das telas reais.

## Item 2 (Modal de metadados) — redesenhar o SHELL, não o card

O `MetadataCard` já está 100% em tokens `--wb-*` e denso. O que destoa é o
shell genérico `ui/modal.tsx`. Mini-guia (detalhe no §4 da AUDITORIA-v3):

- Container: `bg --wb-bg-panel; border --wb-border; radius --radius-lg;
  shadow --wb-shadow`.
- Header: `bg --wb-bg; padding 12×16; border-b --wb-border-soft`; título
  serif (font-editorial) 17px/500 `--wb-text`; description mono 10.5px
  `--wb-text-dim`.
- Footer: `bg --wb-bg-inset; padding 10×16; border-t --wb-border-soft`.
- Fechar: 28×28, hover `--wb-bg-inset`.

Uma troca só e TODOS os modais do app entram no padrão. Vale reverter o
[REUSAR] do DE-PARA §6 nesse escopo (shell), mantendo o conteúdo como está.

## Item 3 (Botões de ação do workspace) — modernizar, padrão híbrido

Os botões já usam o Button denso `--wb-*` (não é caso de token). Para
alinhar ao vocabulário do Bruto (ícones para ações secundárias, texto só
no que é primário/frequente):

- **Publicar em massa** → único `variant="default"` (accent), mantém texto.
- **Análise IA** → mantém texto, `variant="outline"` (ação frequente).
- **Abrir no YouTube, Refazer transcrição, Auditar análise, Gerar trechos**
  → viram `IconButton size="toolbar-sm" variant="inset"` com Tooltip
  (ExternalLink / RefreshCcw / ClipboardCheck / Scissors), separador
  vertical `1×24px --wb-border` antes do grupo de texto.
- Container mantém `flex; gap:6px` (trocar gap-1.5 atual está ok).
- Estados pending: mesmo Loader2 girando dentro do IconButton.
