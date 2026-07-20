# 02 — Pós-produção — hand-off Workbench

> Nota de método: `DE-PARA.md`, `PLANO-DE-ETAPAS.md`, `README.md` e `ATALHOS-E-CONFIGURACOES.md`
> só existem hoje em `frontend/design_handoff_workbench/` da pasta principal
> (`gerador-cortes`, não commitados — `??` no `git status`); a pasta não existe nesta
> worktree (`gerador-cortes-d386`) porque worktrees não compartilham untracked files.
> Foram lidos de lá (leitura, não alteração). Todo o resto — código, commits, screenshots
> `capturas/v2/04-pos*.jpg` — foi lido direto desta worktree, branch
> `codex/d386-workbench-etapa-0`, incluindo as ~28 modificações de hoje (19/07) ainda sem commit.

## 1. Escopo desta tela

Duas páginas cobrem o que o pacote de hand-off chama de "Pós-produção", e vale distinguir
porque elas hoje **não compartilham chrome interno**:

| Sub-etapa | Rota | Componente | O que é |
|---|---|---|---|
| "2 Cenas" | `/projetos/:id/post-production` | `ScenesPostProductionPage` → `EditorFase2` | Edição de cenas Remotion + layout YouTube, preview ao vivo |
| "3 Validar" / "4 Renderizar" (render+publicação) | `/projetos/:id/export` | `PostProductionPage` | Dashboard de render por corte, preview do filtro, upload/publicação YouTube |

`/final-review` (revisão final antes de publicar) é uma **terceira** rota, fora do escopo
deste documento — é o destino do link "abrir na aba Revisão" que a fila global mostra
quando um render termina (ver §3.5); presumivelmente é o documento `03`/`05` deste pacote.

"Grade" (Regra 0) não é uma página: é uma **fase do pipeline de render**
(`grade → overlays → render_final`, ver `renderEtapas.ts`), selecionável dentro do
`RenderStepsModal` a partir de `/export`. Não existe uma tela dedicada só a "Grade".

Arquivos centrais inspecionados:

```
frontend/src/features/editor/PosTopbarExtra.tsx
frontend/src/features/post-production/ScenesPostProductionPage.tsx
frontend/src/features/post-production/PostProductionPage.tsx
frontend/src/features/post-production/postProductionPage/components.tsx
frontend/src/features/post-production/RenderStepsModal.tsx
frontend/src/features/post-production/renderEtapas.ts
frontend/src/features/post-production/postProductionNavigation.ts
frontend/src/features/post-production/FiltroTestePanel.tsx
frontend/src/features/editor/fase2/EditorFase2.tsx
frontend/src/features/editor/fase2/CenasPanel.tsx
frontend/src/features/editor/fase2/YoutubeLayoutPanel.tsx
frontend/src/features/editor/fase2/CenaPlayerPanel.tsx
frontend/src/features/editor/fase2/CenasRemotionPreview.tsx
frontend/src/features/editor/fase2/SceneTimeline.tsx
frontend/src/features/editor/fase2/sceneValidation.ts
frontend/src/features/editor/WorkbenchCutsPanel.tsx
frontend/src/features/editor/WorkbenchEditorLayout.tsx
frontend/src/components/workbench/{PanelShell,GlobalQueue,useWorkbenchQueue,useWorkbenchPanels,WorkbenchShell,workbenchRoutes}.tsx
```

Commits relevantes na worktree: `1cc93a8` (D-390, re-hospeda a Pós), `3c04b72` (D-395, painéis
no padrão do design — **este é o commit que introduziu o `PanelShell` em Cenas/Layout**, ver §2),
e as ~28 modificações de hoje sem commit (comentários no código as identificam como
"AUDITORIA-v3"; não há task `D-397+` correspondente em `.guia/tasks.json` no momento desta leitura).

---

## 2. Regra 0 — barra de etapas do corte

**Esta é a implementação original de onde a Regra 0 nasceu, então o escrutínio é maior.**
Fonte: `frontend/src/features/editor/PosTopbarExtra.tsx`, consumida em
`ScenesPostProductionPage.tsx`. Confirmado também visualmente em
`capturas/v2/04-pos.jpg` (a captura bate linha a linha com o componente lido).

### Achado principal: os rótulos não são "Bruto → Cenas → Grade → Final"

O brief desta rodada descreve a barra como `1 Bruto ✓ → 2 Cenas (ativo) → 3 Grade → 4 Final`
(é também como o `DE-PARA.md` §4 a descreve). **O código hoje não tem esses rótulos.** O array
real (`PosTopbarExtra.tsx:86-91`):

```ts
const STEPS: Array<{ n: PosStep; label: string; Icon: typeof FileText }> = [
  { n: 1, label: 'Metadados', Icon: FileText },
  { n: 2, label: 'Cenas', Icon: Layers },
  { n: 3, label: 'Validar', Icon: Eye },
  { n: 4, label: 'Renderizar', Icon: Rocket },
];
```

A captura de tela confirma: a barra renderizada mostra literalmente
`✓ Metadados — 2 Cenas — 3 Validar — 4 Renderizar`. Isso é uma sequência de **sub-passos
dentro da própria Pós** (preencher metadados → editar cenas → validar → disparar o render),
não a jornada macro do corte pelas 4 telas do redesign. `DE-PARA.md` descreve esta barra com
os rótulos "certos" (Bruto/Cenas/Grade/Final) na coluna "Hoje" — ou seja, o próprio hand-off já
narrava uma intenção que o componente shipado não cumpre. Não dá pra saber, só lendo o código,
se foi o hand-off que idealizou rótulos que nunca foram implementados, ou se o componente mudou
depois — de qualquer forma, hoje há uma divergência real entre documento e código.

### Os 4 estados refletem dado real do corte? Só parcialmente

- `active` (`ScenesPostProductionPage.tsx:345`): `renderFinalRunning ? 4 : 2` — um ternário
  binário. O passo 3 ("Validar") nunca fica ativo; não há transição para 1 nem lógica alguma
  ligada a `cenas_validadas`.
- `done` (`ScenesPostProductionPage.tsx:37`): `STEP_DONE_DEFAULT = new Set([1])` — **constante
  fixa**, declarada fora do componente. "Metadados" aparece sempre como concluído,
  independente do corte; os outros 3 nunca aparecem como concluídos, mesmo depois de
  `cenas_validadas=1` ou do corte já estar publicado.

### A barra é clicável de verdade? Só 1 dos 4 passos

`PosTopbarExtra` já expõe `onCenasClick`/`onValidarClick`/`onRenderClick` (props documentadas
em `PosTopbarExtra.tsx:23-28`, com a intenção escrita no próprio JSDoc: *"Callback ao clicar
Validar (3). Tipicamente foca a CTA 'Marcar validadas'"*, *"Callback ao clicar Renderizar (4).
Tipicamente dispara o render"*). Mas quem consome o componente só passa `onMetadadosClick`,
nos dois shells (workbench `ScenesPostProductionPage.tsx:409-414` e legado `:498-504`):

```tsx
<PosTopbarExtra
  tipo={videoTipo}
  active={stepActive}
  done={stepDone}
  onMetadadosClick={() => setMetadataOpen(true)}
/>
```

Clicar em "Cenas", "Validar" ou "Renderizar" dispara `onClickStep` internamente
(`PosTopbarExtra.tsx:47-52`), que chama `onCenasClick?.()` / `onValidarClick?.()` /
`onRenderClick?.()` — todos `undefined`, portanto **no-op silencioso**. Visualmente os botões
têm hover e foco normais (parecem clicáveis porque são `<button>` reais), então o usuário não
tem pista de que 3 dos 4 cliques não fazem nada. Isso já existia antes do redesign Workbench
(o mesmo gap está no branch legado) — não é uma regressão introduzida por D-386..D-396, mas
também nunca foi corrigido por elas.

### Resposta às 3 perguntas do Paulo

1. **Real ou decorativa?** Parcialmente decorativa. É um componente interativo de verdade (não
   é uma imagem/mock), mas 3 dos 4 alvos de clique são no-ops e o estado "concluído" é fixo.
2. **Reflete dado real?** Não, majoritariamente. Só 1 bit de estado real entra na conta
   (`renderFinalRunning`); tudo o resto é constante.
3. **Pronta pra virar modelo pras outras 4 telas?** O **padrão visual** (pill com conectores,
   numeral vira ✓ quando concluído, cor de destaque no passo ativo) é razoável de reaproveitar.
   A **semântica** não está pronta: os rótulos de hoje (Metadados/Cenas/Validar/Renderizar) não
   correspondem ao conceito "Bruto/Cenas/Grade/Final" que a Regra 0 propõe para o pacote
   inteiro, e mesmo dentro do próprio escopo atual 75% dos cliques não navegam e o "concluído"
   é falso. Replicar o componente como está nas outras telas propagaria esse gap. Recomendação:
   decidir com o Paulo se (a) esta barra vira as 4 macro-etapas reais do corte (dado então viria
   de `pipelineStatus.data.fases` + `exportStatus`, cruzando bruto pronto / cenas geradas+validadas
   / grade+overlays+encode prontos / publicado), ou (b) esta barra continua sendo sub-passos
   locais da Pós e uma barra macro **separada** é criada para as 5 telas — antes de copiar
   `PosTopbarExtra` como referência.

> **Resolvido depois desta seção ter sido escrita:** `AUDITORIA-v3-pos-producao.md` §3 (documento
> de design sincronizado nesta worktree logo após esta análise; ver `design_handoff_workbench/`)
> responde exatamente esta pergunta com a opção (b): *"Decisão de design: manter 'Metadados /
> Cenas / Validar / Renderizar' (passos reais e clicáveis > rótulos ilustrativos do protótipo — o
> protótipo será atualizado, não o app). A aparência atual já está correta."* E confirma os valores
> canônicos da pill (container `--wb-border-soft`/`--wb-bg-inset`, passo `h-28px`/`border-radius:
> 9999px`, ativo `--wb-accent`, concluído `--wb-ok`+✓, conector 2×14px) — o styling deste componente
> está fechado, sem gap de design. A Regra 0 (5 segmentos `Workspace/Bruto/Pós/Metadados/Revisão`,
> fonte `workbenchRoutes.ts`) é confirmada como um componente **novo, separado**, com ponto de
> implementação único recomendado em `components/workbench/WorkbenchShell.tsx` (achado de
> `telas/01-edicao.md` §2). **Isso não fecha os gaps funcionais dos itens 2 e 3 abaixo** — cliques
> mortos e `done` hardcoded continuam sendo bugs reais no componente que o design decidiu manter
> como está; a decisão de design resolveu "qual o alvo visual/semântico", não "o componente está
> funcionalmente correto".

---

## 3. O que já está feito

### 3.1 CenasPanel — FEITO

Painel esquerdo, dentro de `PanelShell id="cenas"` (`EditorFase2.tsx:518-523`, título
`` `CENAS · ${cenas.length}` ``). Conteúdo (`CenasPanel.tsx`) cobre o hand-off quase por
completo: gerar cenas por IA (`ClaudeAiButton` → `useGerarCenasClaude`), buscar retratos
(`usePreencherRetratosCenas`), adicionar cena manual + `CenasManualModal`, link pro Studio
Remotion, `RendererConfigControls` (Card + Avançado) para os padrões do projeto, stats
(Duração/Densidade/Cobertura), aviso de sobreposição de cenas (`validateSceneOverlaps` de
`sceneValidation.ts`, renderizado quando `overlappingIndices.size > 0`), lista de `CenaItem`
editável, footer com "Tipos disponíveis" expansível e botão "Marcar validadas"
(`useValidarCenasRemotion`, `data-testid="botao-validar-cenas"`), `saveIfDirty` exposto via
`useImperativeHandle` para o Ctrl+S funcionar mesmo com o painel sempre visível no shell novo.
Confirmado visualmente em `capturas/v2/04-pos.jpg` — estrutura bate com o componente lido.

### 3.2 YoutubeLayoutPanel — FEITO

Painel direito, dentro de `PanelShell id="layout"` (`EditorFase2.tsx:620-663`, título
"LAYOUT YOUTUBE"), com um toggle inline no header (`headerExtra`) que troca entre a aba
"layout" e a aba "filtros" sem sair do painel. Cobre: presets (`useLayoutPresets`),
posicionamento com arraste real (`PosicionamentoModal.tsx`, 3 handlers `onMouseDown` nas
linhas 373/662/720 — é aqui que mora o "mini-preview arrastável" do `DE-PARA.md`, não dentro
do próprio `YoutubeLayoutPanel.tsx`), alternância Full×Compartilhada por segmento
(`InlineModeToggle`), padrão por escopo corte/projeto/global (`PadraoAtualChip`), detecção
automática de cena (`useSegmentosDetectados`). `FiltroTestePanel` + `RendererConfigControls`
ficam atrás do toggle "filtros" do mesmo painel (`EditorFase2.tsx:635-649`) — bate com
"dentro do painel direito (seção colapsável)" do `DE-PARA.md`.

### 3.3 Preview Remotion — FEITO (sem cap de altura — ver §4)

`CenaPlayerPanel.tsx` hospeda um `<Player>` real do `@remotion/player` renderizando
`CenasRemotionPreview` — o mesmo `renderCenaV2`/`SharedCardZoneFrame` do `video-renderer`,
paridade 1:1 com o Studio. Toggle Ctrl+Alt+R é real: `shortcutFromRegistry('pos.toggleRemotion',
handleToggleRemotion)` (`EditorFase2.tsx:498`), tecla registrada em
`shortcutsRegistry.ts:155-161` (`key:'r', mod:'ctrl+alt'`), efeito visível de verdade — com
`remotionEnabled=false` o preview cai para o vídeo bruto cru
(`CenasRemotionPreview.tsx:99-114`) e mostra badge "Bruto · sem cenas". Botão "Studio Remotion"
abre o Remotion Studio numa aba nova (popup síncrono pra não ser bloqueado pelo navegador,
`ScenesPostProductionPage.tsx:244-266`).

### 3.4 Fila global / render em 2º plano — FEITO (registro e progresso reais; drag e notificação faltam — ver §4)

O botão "Renderizar" no topo (`ScenesPostProductionPage.tsx:268-278`) decide entre abrir o
`RenderStepsModal` (se já há etapas prontas) ou já disparar `startRenderFinal`. Este último
**registra o job de verdade** na fila global:

```ts
workbenchQueue?.registerJob({
  corteId, projetoId,
  rotulo: `${rotuloCurtoProjeto(...)} · corte ${corte?.numero} → render`,
});
```

(`ScenesPostProductionPage.tsx:290-294`). `GlobalQueue.tsx` faz poll real via
`usePipelineStatus(job.corteId, true)`, mostra barra de progresso + % + estágio, persiste em
`localStorage` (`workbench-queue-v1`, sobrevive a reload) e, ao concluir, mostra "✓ pronto" com
link "abrir na aba Revisão" (`GlobalQueue.tsx:25-49`). `RenderStepsModal` +
`renderEtapas.ts` (seleção granular de fase grade/overlays/render_final, intervalo contíguo,
"continuar de onde parou") são domínio puro e têm teste (`__tests__/renderEtapas.test.ts`).

### 3.5 Página de export/render/publicação (`/export`) — lógica de negócio FEITA; chrome do Workbench é outra história (§4)

`PostProductionPage.tsx` mantém toda a lógica intacta e funcionando: aprovar/rejeitar/fire/
leitura, gerar bruto, processar clip com filtro, preview de filtro (um/todos/comparativo
"Cine III"), faststart, abrir pasta, processar em massa, upload individual e em massa no
YouTube com agendamento, gate de validação pré-publicação com checagens bloqueantes/avisos
(D-363/D-369, modal em `PostProductionPage.tsx:493-578`). A rota roda dentro do `WorkbenchShell`
(TabStrip + ProjectRail + GlobalQueue continuam visíveis — `routes.tsx:67` monta
`<PostProductionPage/>` sob `<AppShell/>`, que renderiza `WorkbenchShell` quando a flag está
ligada) e `/export` mapeia pra **mesma aba** "Pós" que `/post-production`
(`workbenchRoutes.ts:30`, regex `(?:post-production|export)` → etapa `'pos'`; `tabPath` nunca
gera um link pra `/export` diretamente, sempre volta pra `/post-production`). Nesse nível —
identidade de aba — `DE-PARA.md` §4 ("mantida como step 4 dentro da mesma aba") está correto.

### 3.6 Shell de modal (`ui/modal.tsx`) — REFAZER, EM ANDAMENTO hoje (não commitado)

Não fazia parte do escopo original desta tela, mas afeta diretamente os modais abertos a partir
dela — `CenasManualModal`, `RenderStepsModal`, `PosicionamentoModal` (indireto, via
`ui/card.tsx`/`ui/input.tsx` também tocados hoje) — todos consomem `components/ui/modal.tsx`.
`AUDITORIA-v3-pos-producao.md` §4 é a especificação canônica desta troca (causa raiz do "modal
datado" citada em §0); `telas/05-metadados.md` §3 documenta o diff exato (20 linhas, só tokens
legados → `--wb-*`, sem mudança de contrato) e confirma que ele já bate com o pedido. Nada
adicional a fazer aqui além de commitar junto com o resto do trabalho de hoje.

---

## 4. O que falta

1. ~~**Decidir a semântica da barra de etapas (Regra 0)** antes de replicar~~ — **resolvido**, ver
   nota no fim de §2: o design confirmou manter `PosTopbarExtra` como está; a Regra 0 é um
   componente novo e separado (`WorkbenchShell.tsx`). Os itens 2 e 3 abaixo continuam de pé.

2. **Ligar os cliques 2/3/4 do stepper** — `ScenesPostProductionPage.tsx:409-414` e `:498-504`
   só passam `onMetadadosClick`. Falta implementar `onCenasClick`/`onValidarClick`/
   `onRenderClick` (o JSDoc do próprio `PosTopbarExtra.tsx:23-28` já descreve o comportamento
   esperado) ou, no mínimo, remover a affordance de clique dos passos que não navegam pra não
   simular interatividade que não existe.

3. **Derivar `stepDone`/`stepActive` de estado real** — trocar `STEP_DONE_DEFAULT`
   (`ScenesPostProductionPage.tsx:37`) por algo calculado a partir de `corte.cenas_validadas`,
   `pipelineStatus.data?.fases` e `exportStatusQ`.

4. **`/export` não usa nenhum padrão interno do Workbench** — confirmado por ausência: nada em
   `PostProductionPage.tsx` importa de `components/workbench/*`. `PPCutsRail`
   (`postProductionPage/components.tsx:43-105`) é um `<nav>` de largura fixa (`w-24`, 96px),
   não um `PanelShell` retrátil como `WorkbenchCutsPanel`; `PPTopBar`
   (`postProductionPage/components.tsx:107-222`) é uma barra de status/ferramentas própria, sem
   nenhum stepper. As mudanças de hoje (não commitadas) em `PostProductionPage.tsx` e
   `postProductionPage/components.tsx` trocaram só cores (`text-error` → `text-[var(--wb-err)]`
   etc.), não estrutura. Falta decidir conscientemente: ou "Grade/Final" fica com chrome
   próprio por design (só a aba/tab-strip é compartilhada), ou migra pro padrão
   `PanelShell`/`WorkbenchEditorLayout` das outras telas — hoje está num meio-termo que o
   `DE-PARA.md` não deixa claro.

5. **`h-screen` aninhado dentro do `WorkbenchShell`** (que já é `h-screen`) — observado no
   código, não confirmado visualmente por mim: `PostProductionPage.tsx:373`
   (`flex h-screen min-h-0 overflow-hidden`) e `PPCutsRail`
   (`postProductionPage/components.tsx:55`, `flex h-screen w-24 ...`) presumem viewport cheia,
   mas renderizam dentro de `<main className="min-w-0 flex-1 overflow-y-auto">`
   (`WorkbenchShell.tsx:89`). Vale conferir no navegador se isso gera rolagem dupla ou
   estouro de viewport — é um sinal de que a página não foi adaptada às convenções
   `flex-1`/`min-h-0` do resto do shell, mesmo já usando os tokens de cor `--wb-*`.

6. **Preview Remotion sem `PlayerCap`** — `PlayerCap` (`WorkbenchEditorLayout.tsx:44-60`, teto
   `max-height:44vh`) só é usado no Bruto (`EditorPage.tsx:866`). Em `EditorFase2.tsx` (branch
   `workbench`, ~linha 547-567) o `CenaPlayerPanel` fica num `<div className="min-h-0 flex-1">`
   sem teto — o Remotion Player faz seu próprio letterbox (não estica), mas o container pode
   crescer além do que o Bruto permite, sem a mesma garantia de sobra vertical pra timeline. Se
   a intenção é paridade Bruto↔Pós, falta aplicar `PlayerCap` aqui também.

7. **Dropzone da fila global é só visual** — confirmado lendo `GlobalQueue.tsx:143-147`: é um
   `<div>` com o texto "arraste um corte aqui para renderizar em segundo plano", sem
   `onDragOver`/`onDrop`/`draggable` em lugar nenhum do arquivo — nem em `WorkbenchCutsPanel.tsx`
   (de onde o corte seria arrastado). O caminho que **funciona** de verdade é o botão
   "Renderizar" no topo da página (§3.4), não o arrastar-soltar.

8. **Sem notificação ao concluir job da fila** — o critério de aceite da Etapa 4 do
   `PLANO-DE-ETAPAS.md` pede "job aparece na fila global **e notifica** ao concluir". O
   "aparece" está feito; a notificação, não — não há `useToast().notify(...)` nem som ligado à
   transição pra `state==='done'` em `GlobalQueue.tsx`. A preferência `wb-queue-notify`
   (`nunca|toast|toast+som`) do `ATALHOS-E-CONFIGURACOES.md §3` não aparece em nenhum lugar do
   código (busca por `wb-queue-notify` não retorna nada).

9. **Larguras dos painéis divergem do `README.md`** — o README documenta "cenas 232/40px,
   layout YouTube 260/38px"; o código hoje (mudança de hoje, sem commit) usa 292/40 e 276/38:

   ```ts
   // AUDITORIA-v3 §6: CENAS 292px / LAYOUT YOUTUBE 276px — abaixo disso os
   // itens de cena e os labels do layout quebram linha e truncam.
   cenas: { open: 292, collapsed: 40 },
   layout: { open: 276, collapsed: 38 },
   ```
   (`useWorkbenchPanels.ts:27-30`; o teste em `__tests__/useWorkbenchPanels.test.ts` já foi
   atualizado em conjunto). Não é uma pendência de implementação — é o `README.md` que ficou
   desatualizado; vale sincronizar o pacote de hand-off numa próxima revisão.

10. **Tabela de atalhos do `ATALHOS-E-CONFIGURACOES.md §1` tem um item que não existe** —
    "Início/fim da seleção | `I` / `O` | pós" não corresponde a nada em
    `shortcutsRegistry.ts`: não há `key:'i'` no arquivo inteiro, e o único `key:'o'` é
    `bruto.abrirPasta` (tela Bruto, sem relação com seleção). O que existe de fato hoje para
    início/fim de seleção na Pós é `Ctrl+,` / `Ctrl+.` (seek ao início/fim,
    `pos.seekToSelectionStart/End`) e `[` / `]` (ajustar início/fim pro tempo atual,
    `pos.adjustSelectionStart/End`) — `shortcutsRegistry.ts:172-200`. `L` (na verdade `Ctrl+L`,
    travar seleção) e `Ctrl+Alt+R` (Remotion↔bruto) conferem com o hand-off.

11. **Sem teste automatizado cobrindo a integração Workbench da Pós** — não há teste para o
    branch `workbench` de `EditorFase2`, para `PosTopbarExtra`, para `WorkbenchCutsPanel`, nem
    para `/export` dentro do shell novo. Os testes existentes de workbench
    (`useWorkbenchPanels.test.ts`, `useWorkbenchTabs.test.ts`, `workbenchRoutes.test.ts`,
    `RetractableFooter.test.tsx`) cobrem só a infraestrutura genérica. O `PLANO-DE-ETAPAS.md`
    previa "smoke manual" por etapa nesse ponto — o que falta é rodar/registrar esse smoke
    (D-390 já lista pendente "validar Ctrl+Alt+R e fluxo de render completo em uso real"), não
    necessariamente testes automatizados novos.

---

## 5. Checklist final de continuidade

- [x] ~~Decidir com o Paulo a semântica da barra de etapas (Regra 0)~~ — **resolvido**: fica
      `PosTopbarExtra` como está (sub-passos locais) + Regra 0 é um componente novo de 5 segmentos
      (`Workspace/Bruto/Pós/Metadados/Revisão`) em `WorkbenchShell.tsx` (ver nota no fim de §2).
- [ ] Implementar esse componente de Regra 0 e conectá-lo nesta tela.
- [ ] Ligar `onCenasClick`/`onValidarClick`/`onRenderClick` do `PosTopbarExtra` (ou remover a
      affordance de clique dos passos inertes).
- [ ] Derivar `stepDone`/`stepActive` de dado real do corte (cenas validadas, fases do pipeline,
      publicado).
- [ ] Decisão consciente sobre `/export`: chrome próprio por design, ou migração pra
      `PanelShell`/`WorkbenchEditorLayout` — e, se migrar, resolver o `h-screen` aninhado antes.
- [ ] Aplicar (ou descartar conscientemente) `PlayerCap` no preview Remotion da Pós.
- [ ] Ligar o drop real na fila global, ou remover o texto-convite até existir.
- [ ] Notificação (toast, e depois `wb-queue-notify`) ao job da fila concluir.
- [ ] Sincronizar `README.md` com as larguras reais dos painéis (292/276) numa próxima revisão
      do pacote de hand-off.
- [ ] Corrigir a linha de atalhos I/O no `ATALHOS-E-CONFIGURACOES.md §1` para refletir
      `,`/`.`/`[`/`]`.
- [ ] Rodar o smoke manual pendente do D-390: Ctrl+Alt+R e fluxo de render completo
      (cenas → grade → final) em uso real.
