# 05 — Metadados (página + modal)

## 1. Escopo

Este documento cobre:

- **Página de Metadados** — rota `/projetos/:id/metadados`, componente `frontend/src/features/metadata/MetadataPage.tsx`.
- **Modal de Metadados** — `frontend/src/features/metadata/MetadataModal.tsx`, acesso rápido a partir do editor/pós (DE-PARA §6).
- **Conteúdo compartilhado** entre os dois — `frontend/src/features/metadata/MetadataCard.tsx` (prop `variant: 'card' | 'modal'`).
- **Avaliação de thumbnail** — `frontend/src/features/metadata/ThumbnailAvaliacaoPanel.tsx` + `thumbnailAvaliacao.ts` (D-066).

Nota de dependência: esta tela usa o shell `frontend/src/components/ui/modal.tsx`, um primitivo **compartilhado por ~19 arquivos do app inteiro** — não é exclusivo de Metadados. A seção 3 documenta a mudança de hoje nesse shell com foco nela, sem auditar os outros consumidores.

Fontes usadas: `DE-PARA.md` §6, `PLANO-DE-ETAPAS.md` Etapa 5, `README.md` (tokens), código atual da worktree (`codex/d386-workbench-etapa-0`), `git diff`/`git log` na worktree, e `.guia/tasks.json` do repo principal só para status de tarefas D-NNN.

---

## 2. Regra 0 — barra de etapas do corte

### (a) Existe hoje algum indicador de etapa/progresso nesta tela?

**FALTA.** Não existe, no sentido pedido (uma barra Bruto/Cenas/Grade/Final por corte). Confirmado lendo `MetadataPage.tsx` por completo: nenhum import de `PosTopbarExtra`, `StatusPills` ou qualquer stepper.

O que existe hoje e **não** deve ser confundido com a Regra 0:

| Elemento | Onde | O que mede |
|---|---|---|
| Rodapé "PRONTO P/ YOUTUBE X de Y" + barra | `MetadataPage.tsx:200-226` | Agregado do **projeto**: quantos cortes têm `pronto_publicar` e ainda não foram publicados — não a posição de 1 corte no pipeline |
| Dot ready/partial/empty na `MetadataCutBar` | `MetadataPage.tsx:240-299`, função `metadadoStatus` (linhas 13-17) | Completude dos **próprios metadados** daquele corte (título gerado? prompt? thumbnail?) — não das etapas de render |
| `MetadataRightRail` | `MetadataPage.tsx:301-340` | 3 métricas agregadas do projeto (Metadados/Prompts/Thumbs) |

Confirmado também no screenshot de referência (`capturas/v2/06-metadados.jpg`, anterior à refação de hoje): o protótipo original também não desenha nenhuma barra de etapas nesta tela — ou seja, a Regra 0 é um requisito novo desta rodada de hand-off, não algo que ficou pra trás do design original.

### (b) Como a barra de etapas do corte deveria se relacionar com a navegação desta tela?

Hoje existem **três modelos de "etapa" diferentes** no código, nenhum unificado, nenhum plugado em Metadados:

| Componente | Arquivo | Etapas modeladas | Tokens | Clicável |
|---|---|---|---|---|
| `StatusPills` | `features/projeto-detalhe/StatusPills.tsx` (usado em `CorteCard.tsx`, confirmado via grep) | Bruto → Cenas → Graded → Overlays → Final → YouTube → Thumb → **Meta** (8 pills; comentário linha 75) | Legado (`--border`, `bg-bg-800/60`, `accent-500/40`) — **não** migrado para `--wb-*` | Não (só tooltip) |
| `PosStepperBar` (dentro de `PosTopbarExtra.tsx`) | `features/editor/PosTopbarExtra.tsx`, array `STEPS` linhas 86-91 | **Metadados** → Cenas → Validar → Renderizar (4) | `--wb-*` | Sim (`onClickStep`) |
| `renderEtapas.ts` | `features/post-production/renderEtapas.ts` | grade → overlays → render_final (3) — seletor de operação p/ `RenderStepsModal`, não navegação | domínio puro | n/a |

**Achado a registrar (divergência hand-off × código):** o `DE-PARA.md` §4 descreve a coluna "Hoje" de `PosTopbarExtra` como já tendo os passos "1 Bruto → 2 Cenas → 3 Grade → 4 Final". O array `STEPS` real no código (`PosTopbarExtra.tsx:86-91`) é **Metadados → Cenas → Validar → Renderizar** — rótulos diferentes dos que o hand-off atribui ao componente atual. Vale confirmar com o Paulo antes de desenhar a barra unificada, porque muda a base de reaproveitamento (generalizar um componente que já fala "Metadados" é diferente de generalizar um que fala "Bruto/Grade").

Dado relevante: o `PosStepperBar` atual já trata "Metadados" como passo 1 clicável — o clique dispara `onMetadadosClick`, que (em `ScenesPostProductionPage.tsx`) abre o `MetadataModal`. Ou seja, **já existe hoje uma ponte Pós → Metadados**, mas unidirecional: de dentro da própria tela de Metadados não há como ver onde o corte está no pipeline de render, nem voltar para lá.

`StatusPills` é hoje o único lugar do código que já modela "Meta" como uma etapa entre as demais (Bruto..Final) — mas vive só no Workspace (`CorteCard.tsx`), é somente leitura (tooltip), e está em tokens fora do sistema `--wb-*`.

**Avaliação** (leitura própria do que bate com os dados já existentes — não é uma decisão já registrada em nenhuma fonte lida): `MetadadoCorte` é 1:1 com `Corte`, e a lista de Metadados já filtra só cortes `aprovado`/`editado`/`processado` (`MetadataPage.tsx:33-34`). Tanto no `MetadataModal` (contexto de 1 corte) quanto no topo da aba "N · Metadados" para o corte focado na `MetadataCutBar`, uma barra Bruto/Cenas/Grade/Final alimentada pelos mesmos campos que já alimentam `StatusPills` (`raw_pronto`, `cenas_validadas`, `grade_pronta`, `video_pronto` de `StatusExportCorte`) responderia "onde esse corte está" sem precisar de dado novo no backend. Ela seria **complementar** ao dot ready/partial/empty da `MetadataCutBar` (que fala só de metadados), não substituta — são duas perguntas diferentes ("o corte está renderizado?" vs. "os metadados deste corte estão prontos?").

### (c) O que falta para bater com a intenção da Regra 0 aqui

- Não existe nenhum componente de stage-bar **compartilhado** entre as 5 telas (nem em `workbench/`, nem em `ui/`). `PosStepperBar` está privado dentro de `features/editor/PosTopbarExtra.tsx` (não exportado) e com rótulos hardcoded para o fluxo Pós.
- Falta decidir a fonte de verdade única do conjunto de etapas — hoje são 3 modelos que não batem entre si (8 pills de `StatusPills` vs. 4 rótulos Bruto/Cenas/Grade/Final que o hand-off atribui a Pós vs. 4 rótulos reais de `PosStepperBar`, que já incluem Metadados).
- Zero wiring em `MetadataPage.tsx` / `MetadataModal.tsx` / `MetadataCard.tsx`: nenhum import, nenhum placeholder, nenhum espaço reservado no layout para essa barra.
- Se a decisão for reaproveitar o visual do `PosStepperBar` (pill clicável, ativo = accent, concluído = check verde, já em `--wb-*`), ele precisa ser extraído para um componente compartilhado antes de chegar em Metadados.

> **Definição e decisão confirmadas depois desta análise** (fontes sincronizadas na worktree: `telas/README.md` do pacote Claude Design, 19/07, e `AUDITORIA-v3-pos-producao.md` §3): a Regra 0 é uma barra **de 5 segmentos** — `Workspace → Bruto → Pós → Metadados → Revisão` — usando os dados já prontos em `workbenchRoutes.ts` (`ETAPA_LABELS`/`ETAPA_DOT_TOKENS`/`tabPath`), com **um único** ponto de implementação recomendado em `WorkbenchShell.tsx` (entre `<TabStrip/>` e o conteúdo), não replicada tela a tela. E a AUDITORIA-v3 já resolve a dúvida do achado acima: **o `PosStepperBar`/`PosTopbarExtra` fica como está** — "manter os 4 rótulos reais [Metadados/Cenas/Validar/Renderizar]... a aparência atual já está correta" — ele **não** é extraído nem generalizado para virar a Regra 0; é um componente novo e separado. Isso não muda nenhuma conclusão de (a)/(b)/(c) acima sobre Metadados especificamente: continua faltando o wiring, só que agora contra um alvo confirmado (o componente do shell), não mais três modelos concorrentes.

---

## 3. Shell `ui/modal.tsx` — o que mudou hoje

Arquivo: `frontend/src/components/ui/modal.tsx`. Diff de hoje (`git diff -- frontend/src/components/ui/modal.tsx`, não commitado): **20 linhas, só `className`**. Nenhuma mudança de props, estrutura ou comportamento — a interface `ModalProps`, o mapa `SIZES`, os 3 `useEffect` (ESC fecha, scroll-lock do body, foco automático) e o overlay (`bg-black/60 backdrop-blur-sm`) continuam idênticos.

| Elemento | Antes | Depois |
|---|---|---|
| Painel (borda/fundo/sombra) | `bg-surface-1 border border-[var(--border)] shadow-lg` | `border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] shadow-[shadow:var(--wb-shadow)]` |
| Header (borda/fundo/padding) | `border-b border-[var(--border)] p-4` | `border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-4 py-3` |
| Título | `text-base font-semibold text-text-100` | `font-editorial text-[17px] font-medium leading-snug text-[var(--wb-text)]` |
| Descrição | `text-xs text-text-300` | `font-code text-[10.5px] text-[var(--wb-text-dim)]` |
| Botão fechar | `-m-1 h-8 w-8 rounded-md text-text-300 hover:bg-bg-800 ring-accent-500` | `h-7 w-7 rounded-[var(--radius-xs)] text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] ring-[var(--wb-focus)]` |
| Corpo (padding) | `p-4` | `px-4 py-3.5` |
| Footer (borda/fundo/padding) | `border-t border-[var(--border)] p-3` | `border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-4 py-2.5` |

**Leitura da mudança:** é uma migração de tokens legados (`--border`, `bg-surface-1`, `text-text-100/300`, `bg-bg-800`, `ring-accent-500`) para o sistema `--wb-*` que já domina o resto do app redesenhado — todos os tokens novos existem e estão definidos em `index.css` (claro e escuro), confirmado por grep (`--wb-border-soft`, `--wb-focus`, `--wb-bg-panel` etc.). Dois ajustes editoriais acompanham a troca de token:
- O título passa a `font-editorial` (mapeado para `var(--font-serif)` = Newsreader, `index.css:248-249`) — a mesma família usada nos títulos grandes desta tela (ex.: "Metadados & Thumbnails" em `font-editorial text-[56px]`, `MetadataPage.tsx:122`). Antes o título do modal usava o sans genérico, sem relação com a identidade tipográfica do resto do app.
- A descrição passa a `font-code` (JetBrains Mono, `index.css:252-253`), alinhando com os labels mono usados em toda a UI do Workbench.
- O botão fechar encolhe (8×8 → 7×7) e troca `rounded-md` por `--radius-xs`.

Verificação técnica feita (não assumida): compilei um teste isolado com o Tailwind 3.4.19 do projeto (`npx tailwindcss`) para confirmar que a sintaxe `shadow-[shadow:var(--wb-shadow)]` — usada aqui e em ~12 outros arquivos tocados hoje — é a forma **correta**. Sem o hint de tipo `shadow:`, o Tailwind interpreta a variável como cor e nunca chega a emitir a declaração `box-shadow` (a classe gera só `--tw-shadow-color`, sem propriedade `box-shadow` nenhuma). Com o hint, o CSS gerado é o esperado (`box-shadow: ..., var(--tw-shadow)` com `--tw-shadow: var(--wb-shadow)`). Não é uma regressão introduzida hoje.

> **Confirmação contra a especificação canônica** (`AUDITORIA-v3-pos-producao.md` §4, sincronizada na worktree após esta seção ter sido escrita — é o documento de design que pediu exatamente este REFAZER): todos os valores acima batem **exatamente** com o pedido — container `--wb-bg-panel`/`--wb-border`/`--radius-lg`/`--wb-shadow`; header `padding:12px 16px`/`--wb-border-soft`/`--wb-bg`; título serif `font-editorial` 17px/500 `--wb-text`; descrição mono `font-code` 10.5px `--wb-text-dim`; fechar 28×28 (`h-7 w-7`) hover `--wb-bg-inset`; footer `--wb-bg-inset`/`--wb-border-soft`. Não sobrou nenhuma divergência entre o pedido e o implementado neste shell — a migração está tecnicamente completa e correta, só falta commitar (ver §6).

**O que falta no shell:** nada identificado como pendência funcional. É uma troca de tokens 1:1, sem mudança de contrato — os consumidores não precisam de nenhuma alteração de código para herdar o novo visual. Nenhum dos 3 documentos de referência lidos (README/DE-PARA/PLANO-DE-ETAPAS) pede algo além do que `Modal` já entrega (título, descrição, footer, tamanhos `sm/md/lg/xl`).

**Alcance da mudança (fora do escopo desta tela, citado apenas para contexto):** confirmado via grep, **19 arquivos** importam `@/components/ui/modal` hoje: `YoutubeLayoutPanel`, `MetadataModal`, `MetadataCard`, `ProjetoDetalhePage`, `AnaliseIaModal`, `RenderStepsModal`, `CenasManualModal`, `TrechosManualModal`, `ShortcutsHelpModal`, `AdicionarCorteModal`, `PromptsUtilitariosSection`, `EditorialSkillsSection`, `EditorialScaffoldsSection`, `SettingsModal`, `CommonTopBar`, `ChannelsPage`, `PostProductionPage`, `PublicarMassaModal`, `AuditoriaAnaliseModal`. Todos herdam a mudança automaticamente, sem edição própria. Dentro do escopo de Metadados, os consumidores são só `MetadataModal.tsx` e o `PromptImportModal` interno (definido no fim de `MetadataCard.tsx:1096-1224`, usado para colar prompt/JSON manual de IA) — os outros 17 não foram auditados aqui, por estarem fora de escopo.

**Primitivos irmãos tocados na mesma passada de hoje** (mesmo padrão de migração de tokens + mesma sintaxe `shadow-[shadow:var(...)]`): `card.tsx`, `claude-button.tsx`, `icon-button.tsx`, `input.tsx` (diffs pequenos, 2-12 linhas cada). Dentro do escopo de Metadados, só 2 desses 4 primitivos são efetivamente usados: `ClaudeAiButton` (botões "gerar/regerar metadados via Claude", ambos variants) e `IconButton` (ações compactas de thumbnail no variant modal, uso novo de hoje). `Card` e o `Input` compartilhado **não** são usados por `MetadataCard.tsx` — o card monta seu próprio `<article>`/`<input>` com classes inline (confirmado lendo o arquivo por completo), então a migração desses dois primitivos não afeta nada visualmente nesta tela.

---

## 4. O que já está feito — Página de Metadados

| Item do DE-PARA §6 | Status | Onde / evidência |
|---|---|---|
| Aba "N · Metadados": lista esquerda de cortes aprovados com status ✓ completo / ⚠ pendências | **FEITO** | `MetadataCutBar` em modo `vertical`, `MetadataPage.tsx:240-299`; ativado quando `isWorkbenchEnabled()` (linhas 93-102); dot ready/partial/empty via `metadadoStatus()` (linhas 13-17) |
| Centro com card de títulos: variantes **com score**, copiar 📋, ✦ regerar | **PARCIAL** — copiar/regerar feitos, score falta | Variantes + copiar + regerar: `MetadataCard.tsx` (`titleSuggestions`, função `copy()`, mutation `generateMetadataClaude`). Score: **FALTA** — `MetadadoCorte.opcoes_titulo` é `string[]` puro (`types/models.ts:335`), sem campo numérico; nenhum componente (`ModalChip`/`SuggestionButton`) recebe ou exibe número |
| Descrição + tags | **FEITO** | Textareas em ambos variants; `sanitizeDescription()`, `splitTags()` |
| Card Thumbnail: preview 16:9, nota + critérios, ✓ Aprovar/↻ Refazer | **PARCIAL** — preview/nota/critérios feitos, vocabulário do veredito diverge | Preview + nota + 5 critérios (Fiel à tese/Clara/Bonita/Chamativa/Honesta) via `ThumbnailAvaliacaoPanel` + `thumbnailAvaliacao.ts:14-26`. O veredito **não** é binário "Aprovar/Refazer": é escala de 4 pontos Ótimo/Bom/Regular/Ruim (`thumbnailAvaliacao.ts:5-10`) — vocabulário diferente do descrito no hand-off |
| Campo "Hints" (F-058) | **FEITO** | `<ThumbnailHintsEditor corteId={cut.id} initialValue={cut.hints_thumbnail} />` presente nos dois variants de `MetadataCard.tsx` (linhas 558 e 781) |
| `MetadataModal` mantido para acesso rápido | **FEITO** | ver seção 5 |
| Rodapé "PRONTO P/ YOUTUBE X de Y" + barra + "▶ Publicar em massa" | **FEITO** | `MetadataPage.tsx:200-226`; abre `PublicarMassaModal` reusado (`[REUSAR]` no DE-PARA) |

Também feito, fora da tabela do DE-PARA:
- `MetadataRightRail` — painel direito com 3 métricas agregadas do projeto (Metadados/Prompts/Thumbs), visível só em telas `xl:` (`MetadataPage.tsx:301-340`).
- Header compacto específico do Workbench (`MetadataPage.tsx:105-111`) coexistindo com o header legado grande (`font-editorial text-[56px]`) quando a flag `VITE_WORKBENCH` está desligada — condicionado por `isWorkbenchEnabled()` em toda a página, preservando o layout legado (regra de convivência do `PLANO-DE-ETAPAS.md` linha 10).

**Commit de origem:** `7d99ccc` — "✨ feat(D-391): adapta Metadados e Revisao final ao shell Workbench" (status Guia Fluxo: **Aguardando validação**). A mensagem do commit confirma o escopo exato: *"MetadataPage no Workbench ganha lista esquerda vertical de cortes aprovados com status por item, header compacto e rodapé 'PRONTO P/ YOUTUBE X de Y' com barra + Publicar em massa (PublicarMassaModal reusado); layout legado intacto."* Esse commit tocou **só** `MetadataPage.tsx` (e `FinalReviewPage.tsx`, fora de escopo aqui, confirmado via `git show --stat 7d99ccc`) — **não** tocou `MetadataCard.tsx` nem `MetadataModal.tsx`. Ou seja: tudo que envolve o card de títulos/thumbnail em si (item 2 e 4 da tabela acima) e o modal (seção 5) é trabalho de **hoje, não commitado**, adicional ao que D-391 já fechou.

---

## 5. O que já está feito — Modal de Metadados

`MetadataModal.tsx` é um wrapper fino (25 linhas): `<Modal size="xl" title="Metadados — Corte #N" description={titulo_proposto}>` envolvendo `<MetadataCard variant="modal" onRequestClose={onClose} />`.

**FEITO hoje, não commitado** (diff de 1 linha em `MetadataModal.tsx`, mostrado como "2" no diffstat por ser 1 remoção + 1 adição): a prop `variant="modal"` e `onRequestClose={onClose}` passadas ao `MetadataCard`. Antes de hoje, `MetadataModal` renderizava `MetadataCard` sem variant nenhum — ou seja, reaproveitava o card de lista inteiro, com seu **próprio** header recolhível, duplicando o header que o `Modal` shell já desenha.

**FEITO hoje, não commitado** (é o grosso das 569 linhas alteradas em `MetadataCard.tsx`): um corpo de renderização alternativo, ativado por `variant === 'modal'`, especificamente desenhado para caber num modal:
- Header próprio do card **desligado** em modo modal (`{!modal && <header>...}`, `MetadataCard.tsx:276`) — elimina a duplicidade com o header do `Modal`.
- Campos "Título YouTube" e "Texto da capa" com `ModalFieldLabel` (label mono uppercase + contador de caracteres na mesma linha, `MetadataCard.tsx:943-969`) e sugestões como `ModalChip` (pill arredondado, com estado `accent` para as ações de IA, `MetadataCard.tsx:973-1003`) — componentes **novos**, usados só no variant modal.
- Descrição e tags **sempre visíveis** lado a lado (`showDescription`/`showTags` nascem `true` quando `modal`, linha 79-80) — no variant card ficam atrás de toggle.
- Coluna lateral de thumbnail com ações compactas via `IconButton` (copiar pasta / comprimir / remover) em vez dos botões de texto completo do variant card.
- Footer dedicado do modal: "salvo há X min" (novo estado `lastSavedAt`, setado no `onSuccess` do `saveMutation`, mais o helper `relativeMinutes`) + botões "Fechar" (chama `onRequestClose`, ou seja, fecha o `Modal` pai) e "Salvar metadados".

Confirmado por leitura do diff completo (`git diff -- frontend/src/features/metadata/MetadataCard.tsx`): o corpo do variant **card** (não-modal) ficou **byte-a-byte igual** — a única mudança nele foi trocar a condição `{expanded && generated && (` por `{expanded && generated && !modal && (`. Nenhuma linha dentro da seção do card clássico foi tocada. É uma mudança **aditiva**: não há regressão de comportamento na lista de página inteira.

**FEITO (reuso):** `ThumbnailAvaliacaoPanel` e `ThumbnailHintsEditor` aparecem também no variant modal, idênticos ao variant card.

**FEITO (herdado de graça, sem código extra):** o `PromptImportModal` interno (colar prompt/JSON manual de IA, usado tanto a partir do card quanto do modal) e o próprio `MetadataModal` usam o shell `ui/modal.tsx` — herdam a nova aparência descrita na seção 3 automaticamente.

**Conclusão sobre a natureza da mudança (respondendo à pergunta central deste hand-off):** as 569 linhas alteradas em `MetadataCard.tsx` **não são consequência de consumir os novos tokens do shell** — são conteúdo/layout novo: um variant de renderização inteiro, construído para a densidade de um modal. O único fio que liga essa mudança à refação de `ui/modal.tsx` é o reuso do `IconButton` (que também ganhou o ajuste de token hoje) e do `ClaudeAiButton` já usado no corpo antigo — ambos primitivos, não o shell do modal em si.

---

## 6. O que falta

### Shell (`ui/modal.tsx` e primitivos irmãos)

- Nada pendente identificado no próprio `modal.tsx` — troca de tokens concluída, contrato inalterado, os 19 consumidores herdam automaticamente.
- Pendência de **processo**, não de código: as mudanças de hoje em `modal.tsx`, `card.tsx`, `claude-button.tsx`, `icon-button.tsx`, `input.tsx`, `MetadataCard.tsx`, `MetadataModal.tsx` (e ~21 outros arquivos da worktree) seguem **não commitadas** — sem `[unlock:]`, sem validação manual registrada no Guia Fluxo.

### Conteúdo de Metadados

1. **Regra 0** — nenhuma barra de etapas do corte na tela (nem página, nem modal). Ver seção 2(c).
2. **Score por variante** de título/thumbnail, prometido em DE-PARA §6, não existe em nenhuma camada: nem no tipo (`MetadadoCorte.opcoes_titulo: string[]`, `types/models.ts:335`), nem na UI. Implementar exige decidir de onde viria o score antes de desenhar a UI — não é só um ajuste visual.
3. **Vocabulário do veredito de thumbnail diverge do hand-off:** código usa Ótimo/Bom/Regular/Ruim (`thumbnailAvaliacao.ts:5-10`, feature D-066 already existente); DE-PARA §6 descreve "✓ Aprovar/↻ Refazer". Duas leituras possíveis — (i) o hand-off está descrevendo livremente a ideia e o texto dele deveria ser ajustado para bater com o D-066 já existente, ou (ii) a intenção é literalmente um botão binário aprovar/refazer, o que seria feature nova. Não decidido aqui — precisa confirmação do Paulo.
4. **Tamanho de arquivo:** `MetadataCard.tsx` já passa de 1200 linhas com 2 variants inteiros somados no mesmo arquivo — candidato a split (ex.: extrair o corpo do variant modal, ou `ModalFieldLabel`/`ModalChip`/`relativeMinutes`, para um módulo próprio) quando a tela sair de "Aguardando validação". Não bloqueante, mas cresce a cada rodada de auditoria.
5. **Cobertura de teste:** único teste em `features/metadata/__tests__/` é `thumbnailAvaliacao.test.ts` (lógica pura de veredito/critérios) — nenhum teste cobre o novo `variant="modal"` de `MetadataCard`.
6. Trabalho de hoje segue não commitado na worktree (ver `git status`) — sem `[unlock:]`, sem validação manual do Paulo.

---

## 7. Checklist final

- [x] Confirmar com o Paulo se a divergência do `PosTopbarExtra` (código = Metadados/Cenas/Validar/Renderizar) vs. `DE-PARA.md` §4 (Bruto/Cenas/Grade/Final) é erro do hand-off ou reflete uma intenção real de renomear os passos. **Resolvido:** `AUDITORIA-v3-pos-producao.md` §3 confirma intenção real — o `DE-PARA.md`/protótipo é que ficam desatualizados, o componente fica como está.
- [ ] Implementar a barra de etapas do corte (Regra 0 — `Workspace/Bruto/Pós/Metadados/Revisão`, um componente em `WorkbenchShell.tsx`) e conectar Metadados a ela — modelo e dono já definidos (ver seção 2), falta só o wiring.
- [ ] Decidir se "score" por variante de título/capa é escopo desta rodada (precisa de campo novo em `MetadadoCorte`) ou fica para depois.
- [ ] Confirmar redação do veredito de thumbnail (Ótimo/Bom/Regular/Ruim atual vs. "Aprovar/Refazer" do hand-off).
- [ ] Rodar `npm run lint && npx vitest run` sobre o `variant="modal"` novo (sem teste dedicado hoje).
- [ ] Smoke manual: abrir `MetadataModal` a partir do editor/pós e conferir header único, sem duplicidade com o antigo header do card.
- [ ] Commitar o trabalho de hoje (`modal.tsx` + stragglers + `MetadataCard.tsx`/`MetadataModal.tsx`) com `[unlock:]` se algum arquivo tocado estiver no `registry.yaml` de locks.
