# 04 — Projetos: Biblioteca + Workspace

**Escopo:** duas telas documentadas juntas por serem o par lista → detalhe do mesmo domínio (`Projeto`):

- **Biblioteca** — rota `/projetos`, componente `ProjetosPage` (`frontend/src/features/projetos/ProjetosPage.tsx`)
- **Workspace do projeto** — rota `/projetos/:id`, componente `ProjetoDetalhePage` (`frontend/src/features/projeto-detalhe/ProjetoDetalhePage.tsx`)

**Fontes lidas:** `DE-PARA.md` §1/§2, `PLANO-DE-ETAPAS.md` Etapa 2, `README.md`. Nota de rastreabilidade: esses três arquivos são **não versionados** (`git status` os marca `??`) e hoje só existem no checkout principal (`C:\Users\paulo\OneDrive\DEV\gerador-cortes\frontend\design_handoff_workbench\`) — não estão presentes na worktree `gerador-cortes-d386`. Só as capturas (`capturas/v2/`) e o código vivem na worktree. Todo o restante deste documento — código, commits, diffs — foi lido **na worktree**, como instruído. Capturas conferidas: `capturas/v2/01-biblioteca.jpg`, `02-workspace.jpg` (tema claro).

Convenção de status: **FEITO** (funcionando, ainda que em commit não fechado/validado) · **EM ANDAMENTO** (mudança de hoje, não commitada) · **FALTA** (não existe ou não bate com o hand-off).

---

## 1. Regra 0 — barra de etapas do corte

### Referência (onde a barra existe hoje)

A barra clicável só existe hoje em UM lugar do app: `PosTopbarExtra` (`frontend/src/features/editor/PosTopbarExtra.tsx`), no slot `extra` do `CommonTopBar` da fase Pós. É um `PosStepperBar` de **4 passos clicáveis** — os rótulos reais no código são `Metadados · Cenas · Validar · Renderizar` (não `1 Bruto → 2 Cenas → 3 Grade → 4 Final`; essa sequência não aparece em lugar nenhum do código — o resumo do brief foi impreciso nesse detalhe). Cada passo é um `<button onClick>` (`PosTopbarExtra.tsx:117-146`), com 3 estados visuais (`isActive` = preenchido; `isDone` = numeral vira ✓; pendente = contorno) e um conector colorido entre os passos já alcançados.

### (a) Aplica-se à Biblioteca?

**Não, e está correto que não se aplique.** A Biblioteca lista N projetos simultâneos — não há "um corte em edição" no contexto da tela. Confirmado no código: `ProjetosPage.tsx` não renderiza nenhum corte individual, só o grid de `ProjetoCard`. A hipótese do brief está certa: nada falta aqui quanto à Regra 0.

### (b) Aplica-se ao Workspace?

**Em princípio sim — cada `CorteCard` do grid representa um corte específico — mas a implementação atual é um resumo, não um navegador.**

Desde o commit `8fd6415` (D-395, "aplica auditoria do design (ícones de etapa + card com capa)"), cada card de corte do Workspace (`CorteLinhaCompacta`, componente inline em `ProjetoDetalhePage.tsx:617-794`) exibe uma fileira de **5 ícones circulares** via `etapasDoCorte()` (`ProjetoDetalhePage.tsx:570-597`): `✂ Bruto · 🎬 Pós-produção · 👁 Revisão · 🏷 Metadados · 🚀 Publicação`, cada um com estado `done/active/todo` (`CLASSE_ETAPA`, `:572-576`) e tooltip via atributo `title`. Há ainda um rótulo textual auxiliar (`labelAuxiliar`, `:599-608`), do tipo "revisar 👁" ou "pronto p/ publicar 🚀".

Isso **não é** o mesmo padrão do `PosStepperBar`:

- os ícones são `<span>` sem `onClick` (`:772-785`) — não navegam para a etapa que mostram;
- clicar em qualquer parte do card — inclusive em cima de um ícone, que não tem `stopPropagation` — sempre dispara `irEditor()` (`:649`) → `navigate(/projetos/:id/cortes/:corteId)`. Essa rota está mapeada em `routes.tsx:63` para `<EditorPage/>`, que só importa componentes de `fase1` (`EditorPage.tsx:40-46`, render em `:1071`) — ou seja, **sempre abre no Bruto**, mesmo que o próprio card mostre a etapa ativa como Revisão ou Metadados.

Ou seja: hoje existe um **resumo de progresso por corte**, não um **navegador de etapas por corte**.

### Distinção importante: pipeline-resumo × navegador-de-etapas

Três componentes visualmente parecidos (fileira de círculos coloridos), três propósitos diferentes — não confundir:

| Componente | Nível | Onde aparece | Clicável? | Etapas mostradas |
|---|---|---|---|---|
| `Pipeline` / `PipelineProgress` (`components/ui/pipeline.tsx`, `features/projetos/PipelineProgress.tsx`) | **Projeto** (agregado de todos os cortes) | `ProjetoCard` (Biblioteca, `compact=false`) **e** `ProjectRail`/`RailCard` (`compact=true`) — mesmo componente reaproveitado, ver `PipelineProgress.tsx:54-63` | Não | Ingestão · Análise · Edição · Metadados · Publicação (`PIPELINE_STAGE_META`) |
| `etapasDoCorte` em `CorteLinhaCompacta` (Workspace) | **Corte individual** | Grid de cortes do Workspace | Não (só tooltip) | Bruto · Pós-produção · Revisão · Metadados · Publicação |
| `PosStepperBar` (`PosTopbarExtra`) | **Corte individual, dentro da fase Pós** | Topo da aba Pós | **Sim** | Metadados · Cenas · Validar · Renderizar |

A `PipelineProgress` da Biblioteca/rail **não é** a Regra 0 — é um resumo agregado do estado do *projeto*, correto como está, e não deveria virar navegador (não há "uma etapa" de projeto para navegar até; são N cortes). O candidato natural para materializar a Regra 0 no Workspace é o `etapasDoCorte`, que já tem a semântica certa (5 etapas do corte), mas falta o comportamento clicável/navegável.

### (c) O que falta para bater com a Regra 0

- Biblioteca: nada — não se aplica.
- Workspace: `etapasDoCorte` precisa de uma das duas soluções (decisão de produto, não deste diagnóstico):
  1. Tornar cada ícone clicável, navegando para a rota da etapa correspondente (`workbenchRoutes.tabPath`: `cortes`→Bruto, `pos`→Pós, `metadados`→Metadados, `revisao`→Revisão — não há rota dedicada para "Publicação"), com `stopPropagation` para não disparar o `irEditor()` do card; **ou**
  2. Manter os ícones como resumo (sem virar botões individuais) mas fazer o clique no card inteiro respeitar a etapa `active` de `etapasDoCorte(status, aprovado)` em vez de sempre abrir no Bruto.

> **Definição oficial da Regra 0 confirmada** (fonte: `telas/README.md` do pacote Claude Design, 19/07, sincronizado na worktree após esta análise): 5 segmentos **de projeto/navegação entre telas** — `Workspace → Bruto → Pós → Metadados → Revisão` (dados prontos em `workbenchRoutes.ts`: `ETAPA_LABELS`/`ETAPA_DOT_TOKENS`/`tabPath`) — ponto de implementação único recomendado em `WorkbenchShell.tsx`, entre `<TabStrip/>` e o conteúdo. Isso é **diferente** do `etapasDoCorte` (5 ícones: Bruto·Pós-produção·Revisão·Metadados·Publicação) documentado acima — aquele é um resumo **por corte individual** dentro do grid do Workspace, este é um navegador **de tela** sempre visível no shell. Os dois podem coexistir e resolvem perguntas diferentes: a barra do shell diz "em que tela eu estou, do projeto/corte focado na aba ativa"; `etapasDoCorte`, se ficar clicável (opção 1 acima), seria o atalho "a partir da lista, pule direto pro card X na etapa Y" — não é redundante, é o ponto de entrada. Nenhuma mudança na avaliação (a)/(b) acima: a Biblioteca continua sem Regra 0 por não ter "um corte em foco"; o Workspace continua com o gap descrito.

---

## 2. O que já está feito

### 2.1 Biblioteca (`ProjetosPage.tsx` + `ProjetoCard.tsx`)

Estável desde o commit `bd476f4` (D-388, "migra Biblioteca e Workspace para o layout Workbench"); nenhuma mudança funcional hoje — só 1 linha de sintaxe Tailwind em `ProjetoCard.tsx` (ver §2.3, final).

| Item | Status | Onde |
|---|---|---|
| Filtros com contagem (Todos / Não publicados / Em análise / Editando / Publicados) | FEITO | `ProjetosPage.tsx:15-43` (`FILTERS`), `:100-106` (contagem por filtro), `:118-133` (chips) |
| Busca por título + canal | FEITO | lógica `:84-98`, campo `:145-153` |
| Chip "reiniciar falhados" (só visível com `temFalhados`) | FEITO | `:76,82,155-185` |
| Criar projeto (`NovoProjetoForm`) | FEITO | `:196`, reaproveita `useCriarProjeto` sem alteração |
| `ProjetoCard`: thumb 16:9, chip de status sobreposto (sup. esq.), score 🏆 (sup. dir.), duração (inf. dir.), título, meta `canal · data · N cortes · N publicados` | FEITO | `ProjetoCard.tsx:75-178` |
| Pipeline de 5 ícones no rodapé do card | FEITO | `:175-177` → `PipelineProgress` → `components/ui/pipeline.tsx` (ver tabela da Regra 0) |
| Borda `--wb-ok` + chip "pronto p/ YouTube" quando `estaProntoPraYoutube` | FEITO | `:29,70-73,93-96` |
| Remover projeto (com confirmação) | FEITO | `:25,39-44` (`useRemoverProjeto`) |
| Limpar mídia pesada (com confirmação, ícone vira ✨ quando já limpo) | FEITO | `:26,46-56` (`useLimparArquivos`) |
| `ProjetoCardSkeleton`, `EmptyState`, ordenação por publicação | FEITO | reaproveitados sem alteração — `ProjetosPage.tsx:8-11,65-70,212-217` |
| Click no card → abre/foca aba do Workspace | FEITO | `ProjetoCard.tsx:35-37` (`navigate`) + `workbenchRoutes.ts` (`routeToTab` reconhece `/projetos/:id` como etapa `workspace`) |

Todos os critérios de aceite da Etapa 2 ligados à Biblioteca (filtros com contagens corretas, criar/remover/limpar projeto, reiniciar falhados, card → aba do Workspace) estão cobertos pelo código atual.

### 2.2 Workspace (`ProjetoDetalhePage.tsx`)

| Item | Status | Onde |
|---|---|---|
| Header: thumb 120px + título + meta (canal/data/duração) | FEITO | `:213-254` |
| Nota da live (`VotoQualidadeLive`) no header | FEITO | `:255-260` — nota: é um widget de **5 estrelas** (`VotoQualidadeLive.tsx:63-78`), não o chip "👍 boa live 👎" descrito no DE-PARA §2. O componente em si é reuso legítimo e não mudou — a descrição do hand-off é que diverge da UI real. |
| Chips de estado do pipeline (`✓ baixado`, `✓ transcrito`, `✓ diarizado · N falantes`, `✂ X/Y avaliados`) | FEITO | `:282-319` |
| Botão "Análise IA" → `AnaliseIaModal` | FEITO | `:391-394,496-502`; modal reaproveitado integralmente |
| Botão "Auditar análise" → `AuditoriaAnaliseModal` | FEITO | `:358-371,503-507`; reaproveitado, só leitura (I-034) |
| Botão "Publicar em massa" → `PublicarMassaModal` | FEITO | `:395-398,508-513`; reaproveitado |
| Diarização acessível pelo chip "diarizado" | FEITO | `:304-313` abre `AnaliseIaModal`, que renderiza `DiarizacaoPanel` quando `origem==='claude'` (`AnaliseIaModal.tsx:287-292`). É um modal, não um popover/aba como o DE-PARA descreve — mas o painel é o mesmo componente reaproveitado. |
| "Gerar trechos (todos os cortes)" | FEITO | `:372-389` (`useAnalisarDesviosTodos`) |
| "Refazer transcrição" | FEITO | `:344-357` |
| Grid de cards de corte compactos, click → abre o corte certo no editor | FEITO | `:469-493` + `CorteLinhaCompacta` (`:617-794`) — o ID do corte aberto sempre confere com o card clicado |
| Reposicionar corte (↑/↓), publicar/informar YouTube por corte, abrir pasta do corte | FEITO | ações rápidas em hover, `:700-756` |

Os critérios de aceite da Etapa 2 ligados ao Workspace estão cobertos, com uma ressalva: "card de corte → aba do editor **no corte certo**" hoje é verdade só quanto ao ID (abre sempre o corte clicado); não é verdade quanto à **etapa** (sempre abre no Bruto — ver Regra 0 (b)/(c)). O `PLANO-DE-ETAPAS.md` não exige explicitamente etapa correta, só corte correto, então o critério literal passa.

### 2.3 Padrão híbrido de ações globais — o que foi confirmado

A tarefa trouxe uma hipótese: que "padrão híbrido" descreve as ações limpar/remover do `ProjetoCard` como hover-reveal **+** um menu de overflow (⋯) de fallback. Depois de ler `ProjetoCard.tsx`, `ProjetoDetalhePage.tsx` e o grid de cortes do Workspace, a resposta é: **nenhum dos dois lugares implementa exatamente essa hipótese** — existem, na verdade, **dois padrões híbridos diferentes**, e nenhum dos dois tem menu ⋯.

**A — `ProjetoCard.tsx` (Biblioteca), ações limpar/remover (`:121-151`):**
Confirmado hover-reveal via `opacity-0` → `group-hover:opacity-100` **e** `focus-within:opacity-100` (`:124`). O `focus-within` cobre o fallback de teclado (Tab alcança os botões e a opacidade abre). **Não existe** nenhum menu "⋯"/kebab em lugar nenhum do código — busca por `MoreHorizontal`, `MoreVertical`, `DropdownMenu` e pelo caractere `⋯` em todo o `frontend/src` não retornou nada nesses componentes (as únicas ocorrências desses ícones no repo inteiro estão em `CommonTopBar.tsx`, `TimelinePanel.tsx` e `CenasPanel.tsx` — telas do Editor/Pós, fora deste escopo). Ou seja: a metade "hover" da frase do DE-PARA §1 ("ações em hover/menu ⋯") **existe**; a metade "menu ⋯" **não foi construída** — não há fallback de touch, só teclado.

**B — `ProjetoDetalhePage.tsx` (Workspace), "Ações globais" do header (`:323-399`) — EM ANDAMENTO, mudança de hoje ainda não commitada:**
Este é o trecho que o próprio código rotula literalmente como "padrão híbrido". O comentário adicionado hoje (visível em `git diff`, ainda não commitado) diz:

> *"Ações globais — padrão híbrido do design (README-v2 item 3): secundárias viram ícone, texto só no que é primário/frequente."* (`ProjetoDetalhePage.tsx:323-324`)

O padrão real, confirmado no JSX: **botões só-ícone** (`IconButton variant="inset" size="toolbar-sm"`, sem texto — `:326-389`) para as ações secundárias/infrequentes (Abrir no YouTube, Refazer transcrição, Auditar análise, Gerar trechos), separados por um divisor vertical (`:390`, `<div className="h-6 w-px bg-[var(--wb-border)]" />`) dos **botões ícone+texto** (`Button variant="outline"`/padrão — `:391-398`) para as ações primárias/frequentes (Análise IA, Publicar em massa). Nada aqui tem relação com hover ou menu de overflow; é uma mistura de dois estilos de botão (ícone puro vs. ícone+rótulo) por frequência de uso, não um mecanismo de revelar/esconder.

Não encontrei o arquivo "README-v2" citado no comentário — não existe em `frontend/design_handoff_workbench/` (nem no checkout principal, nem na worktree) nem em nenhum outro lugar do repositório (busquei por nome e por conteúdo). É referência a uma fonte externa ao repo, provavelmente uma anotação do processo de auditoria de design das rodadas D-394/D-395 (o mesmo processo que os comentários `AUDITORIA`/`AUDITORIA-v2` espalhados pelo código citam, também sem arquivo correspondente no repo). Documento aqui o comportamento observável do código — que é verificável — mas não consigo confirmar o texto original do "item 3".

> **Encontrado depois desta análise:** o arquivo existe — `duvidas-design/README-v2.md` no projeto Claude Design (não em git; sincronizado em `frontend/design_handoff_workbench/duvidas-design/` nesta worktree logo após esta seção ter sido escrita). Item 3, resposta do design (19/07): *"Os botões já usam o Button denso `--wb-*`... Publicar em massa → único `variant='default'` (accent), mantém texto. Análise IA → mantém texto, `variant='outline'`. Abrir no YouTube, Refazer transcrição, Auditar análise, Gerar trechos → viram `IconButton size='toolbar-sm' variant='inset'` com Tooltip (ExternalLink/RefreshCcw/ClipboardCheck/Scissors), separador vertical 1×24px `--wb-border` antes do grupo de texto."* **Confirmado: bate exatamente com o padrão B descrito acima** — ícone puro para as 4 ações secundárias, divisor vertical, texto para as 2 primárias (Análise IA outline, Publicar em massa accent). A implementação de hoje já satisfaz a resposta do design; não há gap aqui além do que já commitar o trabalho em progresso.

**Conclusão:** a hipótese do brief (hover + menu ⋯) descreve parcialmente o padrão A (só a metade hover existe de fato) e não descreve o padrão B. Como a frase desta tarefa ("ações globais em padrão híbrido") bate literalmente com o comentário do padrão B, **B é o "padrão híbrido" citado**; A é um padrão de hover-reveal real, mas diferente, e sem esse nome no código.

Único ajuste de hoje em `ProjetoCard.tsx` (fora do escopo do padrão híbrido): troca de `shadow-[var(--wb-shadow)]` por `shadow-[shadow:var(--wb-shadow)]` — sintaxe de valor arbitrário do Tailwind, mesmo fix aplicado hoje em `icon-button.tsx`. Não muda comportamento nem visual, é ajuste de compilação de classe.

---

## 3. O que falta

| # | Tela | O que | Arquivo-alvo |
|---|---|---|---|
| 1 | Workspace | `CorteLinhaCompacta` não aplica a cor de fundo semântica + borda esquerda 3px que o DE-PARA §2 pede ("ok-soft/err-soft/fire-soft/acc-soft"). O card fica sempre com `bg-[var(--wb-bg-panel)]` neutro; só `rejeitado` ganha `opacity-[.72]` (`:670-673`). A lógica já existe pronta no componente órfão `CorteCard.tsx` (`tintDoCorte`, `:47-57`) — é questão de portar, não de criar do zero. Os tokens (`--wb-ok-soft`, `--wb-err-soft`, `--wb-fire-soft`, `--wb-leitura-soft`) já existem em `index.css`, claro e escuro (`:56,64,70,72` e `:151,159,165,167`). | `ProjetoDetalhePage.tsx` (`CorteLinhaCompacta`, ~`:670`) |
| 2 | Workspace | Não há botão "📁 Abrir pasta" **do projeto** no header, como o DE-PARA §2 lista entre as ações globais. `useAbrirPasta` só é chamado dentro de `CorteLinhaCompacta` (`:641`, botão `:746-755`) — abre a pasta de um corte específico, não a raiz do projeto. | `ProjetoDetalhePage.tsx` (bloco "Ações globais", ~`:325`) |
| 3 | Workspace | `etapasDoCorte` (5 ícones por corte) é hoje só resumo, não navegador — nenhum `onClick`, e o clique no card sempre abre o Bruto independente da etapa ativa mostrada. Ver Regra 0 (b)/(c) para as duas opções de fechamento. | `ProjetoDetalhePage.tsx:570-608,617-794` |
| 4 | Biblioteca | Sem fallback de touch para limpar/remover no `ProjetoCard` — só hover (mouse) e `focus-within` (teclado). Nenhum menu "⋯" existe hoje. Se o "menu ⋯" do DE-PARA §1 for intencional (não só uma forma de dizer "hover"), falta implementar. | `ProjetoCard.tsx:121-151` |
| 5 | Biblioteca + Workspace | `ReadyForYoutubeBadge.tsx` e o par `CorteCard.tsx`/`StatusPills.tsx` estão órfãos — nenhum import ativo em nenhuma tela viva (confirmado por grep no `frontend/src` inteiro; só se referenciam entre si e em seus próprios testes). O DE-PARA §2 pede `ReadyForYoutubeBadge` como `[REUSAR] "Mantido no card"`, mas não está wired em lugar nenhum hoje. Decisão pendente: deletar (código morto) ou reintegrar. | `ReadyForYoutubeBadge.tsx`, `CorteCard.tsx`, `StatusPills.tsx` |

Nenhum destes bloqueia os critérios de aceite literais da Etapa 2 (todos passam, ver §2.1/§2.2) — são gaps contra o detalhamento do DE-PARA e contra a Regra 0, não contra o "Aceite" mínimo do `PLANO-DE-ETAPAS.md`.

---

## 4. Checklist final

- [x] Filtros com contagens corretas (Biblioteca)
- [x] Criar / remover / limpar projeto
- [x] Reiniciar falhados
- [x] Card do projeto → aba do Workspace
- [x] Card de corte → aba do editor, no corte certo (ID)
- [x] Pipeline de 5 etapas do projeto — componente único, reaproveitado entre `ProjetoCard` e `ProjectRail` (`PipelineProgress`)
- [x] Regra 0 não se aplica à Biblioteca (confirmado, por design)
- [ ] Card de corte → aba do editor, na **etapa** certa (hoje sempre Bruto)
- [ ] `etapasDoCorte` clicável, ou card respeitando a etapa ativa (Regra 0 no Workspace)
- [ ] Tint semântico + borda esquerda 3px no card de corte do Workspace
- [ ] Botão "Abrir pasta" do projeto no header do Workspace
- [ ] Fallback de touch (ou menu ⋯ de fato) para limpar/remover no card da Biblioteca
- [ ] Decidir destino de `ReadyForYoutubeBadge` / `CorteCard` / `StatusPills` (código morto)
