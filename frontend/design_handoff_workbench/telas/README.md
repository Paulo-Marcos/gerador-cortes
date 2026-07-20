# Handoffs por tela — reconciliação feito × falta (19/07/2026)

Cinco documentos, um por tela do redesign Workbench, cada um reconciliando **o
que já está implementado** (com referência a arquivo/commit) contra **o que
ainda falta** (gaps concretos e acionáveis), a partir da leitura do código
real na worktree `gerador-cortes-d386` (branch `codex/d386-workbench-etapa-0`)
— não do protótipo isolado. Complementam, sem substituir, o pacote de hand-off
original (`README.md`, `DE-PARA.md`, `PLANO-DE-ETAPAS.md`,
`ATALHOS-E-CONFIGURACOES.md`, um nível acima desta pasta) e as rodadas de
auditoria de design (`AUDITORIA-v2.md`, `AUDITORIA-v3-pos-producao.md`,
`AUDITORIA-IMPLEMENTACAO.md`, `duvidas-design/`).

Convenção de status usada nos 5 documentos: **FEITO** (funcionando, ainda que
em commit não fechado/validado) · **EM ANDAMENTO** (mudança de hoje, não
commitada, tocando o item agora) · **FALTA** (não existe ou não bate com o
hand-off).

## Índice

| # | Tela | Arquivo | Rota principal |
|---|---|---|---|
| 1 | **Bruto (Editor de cortes)** | [`01-edicao.md`](01-edicao.md) | `/projetos/:id/cortes[/:corteId]` |
| 2 | **Pós-produção** | [`02-pos.md`](02-pos.md) | `/projetos/:id/post-production` · `/projetos/:id/export` |
| 3 | **Revisão final** | [`03-resultado.md`](03-resultado.md) | `/projetos/:id/final-review` |
| 4 | **Projetos — Biblioteca + Workspace** | [`04-projetos.md`](04-projetos.md) | `/projetos` · `/projetos/:id` |
| 5 | **Metadados — página + modal** | [`05-metadados.md`](05-metadados.md) | `/projetos/:id/metadados` |

> **Nota sobre um pacote homônimo:** existe, no projeto Claude Design
> ("Redesign de interface web", `project_id 55375336-e0c5-4075-a9ef-3a3884897577`),
> um outro conjunto `design_handoff_workbench/telas/*.md` com os **mesmos
> nomes de arquivo**, mas formato e propósito diferentes: aquele é uma
> **especificação executável** (rota → arquivos-alvo → layout → inventário de
> funcionalidades → nav → tokens → checklist), escrito de fora para dentro
> como alvo de implementação. Este pacote — o que está nesta worktree — é uma
> **auditoria de estado atual**, escrita de dentro do código para fora,
> reconciliando o que já existe com o que falta. São complementares (um diz
> "o que construir", o outro "o que já foi construído e o que resta"), mas
> não são o mesmo arquivo — não copie um por cima do outro sem checar o
> conteúdo. Os dois concordam ponto a ponto na Regra 0 abaixo.

---

## Regra 0 — Barra de etapas do projeto (navegação entre as 5 telas)

**Requisito, aplicado às 5 telas:** deve existir uma barra de etapas do
projeto/corte **sempre visível**, com os **5 destinos na ordem do pipeline**,
navegando para as rotas que já existem (`routes.tsx`) — sem duplicar lógica
de rota nem inventar destinos novos:

```
Workspace   → /projetos/:id
Bruto       → /projetos/:id/cortes[/:corteId]
Pós         → /projetos/:id/post-production[?corte=:corteId]
Metadados   → /projetos/:id/metadados
Revisão     → /projetos/:id/final-review[?corte=:corteId]
```

Fonte de rótulos/cores/rotas **já pronta no código, não usada para isto
ainda**: `components/workbench/workbenchRoutes.ts` — `ETAPA_LABELS`
(Workspace/Cortes/Pós/Metadados/Revisão), `ETAPA_DOT_TOKENS` (cor semântica
por etapa: `--wb-accent` cortes, `--wb-warn` pós, `--wb-fire` metadados,
`--wb-info` revisão) e `tabPath()` (etapa + `projetoId` + `corteId?` → rota).
`WorkbenchTabsProvider` (`useWorkbenchTabsContext().activeTab`) já carrega
`{projetoId, etapa, corteId}` da aba ativa — dado suficiente para montar a
barra sem duplicar nada.

**Por que esta regra existe (motivação concreta, não só estética):** hoje não
há como voltar da Pós para o Bruto do mesmo corte se a aba "Cortes" nunca foi
aberta na sessão (`duvidas-design/README.md`, dúvida aberta do Paulo em
19/07) — o card de corte que já tem bruto pronto roteia direto pra Pós, sem
deixar rastro de aba pra voltar. `ProjetoDetalhePage` (Workspace) também não
tem nenhum atalho pra Metadados/Pós/Revisão — só ações de pipeline. A barra
da Regra 0 resolve as duas lacunas de uma vez: qualquer tela, qualquer
momento, 1 clique pra qualquer outra etapa do mesmo corte/projeto.

**Ponto de implementação recomendado (achado convergente dos 5 documentos):
um único componente, uma única vez**, em
`components/workbench/WorkbenchShell.tsx`, entre `<TabStrip/>` e o
`<div className="flex min-h-0 flex-1">` que segue — lendo `activeTab` do
`WorkbenchTabsProvider`. Cobre as 5 telas de uma vez, sem tocar
`EditorPage.tsx`/`ScenesPostProductionPage.tsx`/`FinalReviewPage.tsx`/
`ProjetoDetalhePage.tsx`/`MetadataPage.tsx` individualmente. Referência
visual: protótipo `Workbench 1c.dc.html`, faixa horizontal logo abaixo do tab
strip ("LIVE 267 · [Workspace → Bruto → Pós → Metadados → Revisão]"),
segmento atual em `--wb-accent`, dots por etapa, rotas à direita, clique
troca de tela.

### O que a Regra 0 **não** é (não confundir — achado repetido nos 5 documentos)

Existem hoje 3 componentes visualmente parecidos (fileira de círculos/ícones
coloridos por etapa) que respondem perguntas **diferentes** da Regra 0 — não
são candidatos a virar a barra, mesmo que pareçam prontos à primeira vista:

| Componente | Nível | Onde | Clicável? | O que mede |
|---|---|---|---|---|
| `PosTopbarExtra`/`PosStepperBar` | Corte, só dentro da fase Pós | Só `ScenesPostProductionPage.tsx` | 1 de 4 passos (Metadados) | Sub-passos **internos** da Pós (Metadados·Cenas·Validar·Renderizar) — **decisão de design confirmada: fica como está**, não generaliza para a Regra 0 (`AUDITORIA-v3-pos-producao.md` §3) |
| `PipelineProgress`/`Pipeline` | **Projeto** (agregado de todos os cortes) | `ProjetoCard` (Biblioteca) e `ProjectRail` (rail global) | Não | Progresso agregado do projeto (ingestão→análise→edição→metadados→publicação) — correto como está, não deveria virar navegador |
| `etapasDoCorte` | Corte individual | Grid de cortes do Workspace (`ProjetoDetalhePage.tsx`) | Não (só tooltip) | Resumo por corte (Bruto·Pós·Revisão·Metadados·Publicação) — mais perto da Regra 0 em espírito, mas é complementar (ponto de entrada a partir da lista), não substituto da barra sempre-visível do shell |

### Status por tela (resumo — ver cada documento para a análise completa)

| Tela | Existe indicador hoje? | Status Regra 0 |
|---|---|---|
| Bruto | Não — `BrutoStepsDropdown` sobrevive mas resolve outro problema (passos de *processamento* do bruto, não navegação entre telas) | **FALTA** |
| Pós | `PosTopbarExtra` existe, mas é sub-navegação interna, semântica diferente | **FALTA** (a barra macro em si) |
| Revisão final | Não — nenhum componente de estágio importado | **FALTA** |
| Projetos — Biblioteca | — | **Não se aplica** (lista N projetos, sem "um corte em foco") |
| Projetos — Workspace | `etapasDoCorte` existe como resumo somente-leitura | **FALTA** (não é clicável, card sempre abre no Bruto) |
| Metadados | Não | **FALTA** |

**Conclusão prática:** a Regra 0 está 100% pendente de implementação em todas
as telas onde se aplica (4 de 5) — mas a infraestrutura de dados já existe
pronta (`workbenchRoutes.ts`) e o ponto de inserção é um único arquivo
(`WorkbenchShell.tsx`), o que torna esta provavelmente a lacuna de maior
alavancagem do pacote: uma implementação fecha o gap nas 4 telas ao mesmo
tempo.

---

## Outras lacunas cross-tela encontradas (não fazem parte da Regra 0, registradas aqui por afetarem mais de um documento)

- **Shell `ui/modal.tsx` (REFAZER)** — migração de tokens legados para
  `--wb-*` já feita hoje, não commitada (`05-metadados.md` §3 tem o diff
  completo e a confirmação de que bate com `AUDITORIA-v3-pos-producao.md`
  §4). Afeta os ~19 arquivos que importam esse shell — inclusive modais
  abertos a partir de Bruto (`02-pos.md` §3.6, `01-edicao.md`) e Pós.
- **Trabalho de hoje (19/07) segue sem commit** — ~29 arquivos modificados na
  worktree (tokens legados → `--wb-*`, o novo `variant="modal"` de
  `MetadataCard`, ajustes de cor no veredito/timeline). Nenhum dos 5
  documentos encontrou regressão funcional nessas mudanças; é puramente
  trabalho pendente de fechar (`[unlock:]` + validação do Paulo), não um
  problema de qualidade.

## Fontes deste pacote

- `../README.md`, `../DE-PARA.md`, `../PLANO-DE-ETAPAS.md`,
  `../ATALHOS-E-CONFIGURACOES.md`, `../Workbench 1c.dc.html` — hand-off
  original (mapeamento página-a-página, etapas, atalhos, protótipo).
- `../AUDITORIA-v2.md` — rodada de auditoria de design focada em Bruto +
  Revisão final (base de `01-edicao.md` e `03-resultado.md`).
- `../AUDITORIA-v3-pos-producao.md` — rodada focada em Cenas + Layout
  YouTube + shell de modal (base adicional de `02-pos.md` e `05-metadados.md`).
- `../AUDITORIA-IMPLEMENTACAO.md` — auditoria anterior (18/07), shell e
  telas com layout antigo.
- `../duvidas-design/` — perguntas do design ao Paulo e respectivas
  respostas (origem do "padrão híbrido" em `04-projetos.md` e da motivação
  da Regra 0 acima).
