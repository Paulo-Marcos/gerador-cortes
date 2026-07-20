# 03 · Revisão final — hand-off (reconciliação feito × falta)

## 0. Escopo desta tela

- **Rota:** `/projetos/:id/final-review?corte=<id>` (definida em `routes.tsx`).
- **Componente:** `frontend/src/features/final-review/FinalReviewPage.tsx` — arquivo único; a feature não tem subpastas nem `__tests__` próprios.
- **Cobertura:** player final, re-renderizar (com escolha de etapa), timeline de conferência (cenas + layout YouTube), aprovar/publicar, voltar para pós.
- **Shell Workbench** só ativa com `isWorkbenchEnabled()` (`components/workbench/workbenchFlag.ts`: `VITE_WORKBENCH=1` ou `localStorage['workbench-shell']`). Este documento cobre o branch Workbench (`FinalReviewPage.tsx:487-638`); o branch legado (`:640-706`, `UnifiedSidebar` + `CommonTopBar`) é citado só quando relevante por comparação.
- **Histórico relevante:** D-391 (`7d99ccc`, 17/07) criou o branch Workbench desta tela ("lógica intocada", conforme a própria mensagem do commit). D-395 (`3c04b72`) ajustou a visibilidade da timeline. D-396 (`e777d5e`, **19/07, mesmo dia**) adicionou os badges de sucesso da timeline — já commitado, mas a tarefa D-396 como um todo segue "Em desenvolvimento". Não há mudança **não commitada hoje** que toque `features/final-review/` diretamente (confirmado via `git status`) — o que existe em progresso são ajustes em componentes compartilhados que esta tela consome indiretamente (ver nota abaixo).

> **Nota metodológica (leia antes do resto).** `AUDITORIA-v2.md` — citado no briefing desta tarefa como "a especificação mais detalhada" (§10, §11, §12) — **não foi encontrado** nem na worktree `gerador-cortes-d386`, nem no repositório principal `gerador-cortes`, nem no histórico `git log --all` de nenhum dos dois. Também não há qualquer referência a ele em `DE-PARA.md`/`README.md`. Adicionalmente, a própria pasta `frontend/design_handoff_workbench/` só existe fisicamente (untracked) no repositório **principal** — na worktree ela não existia até esta tarefa criar `telas/`. Os trechos de AUDITORIA-v2 §10 citados no briefing (header, `height:clamp(170px,36vh,360px)`, badges "9 cenas ✓"/"palco gerado ✓" etc.) foram tratados como informação repassada, e cruzados contra o código sempre que possível — quando o código diverge do que foi citado, isso está marcado explicitamente abaixo. O commit `e777d5e` (D-396, ver §3.4) cita a mesma AUDITORIA-v2 §10/§12 e a mesma sigla **CP11**, o que confirma que o documento existiu em algum momento; ele só não está acessível nesta árvore agora. Tudo que segue foi verificado contra o **código atual** e, quando indicado, contra as capturas `capturas/v2/05-revisao-final*.jpg` (na raiz da worktree).

---

## 1. Regra 0 — barra de etapas do corte

**Status nesta tela: FALTA.**

- (a) **Existe hoje algum indicador de etapas visível?** Não. `FinalReviewPage.tsx` (branch Workbench, linhas 487-638) não importa `PosTopbarExtra` nem nenhum componente equivalente — confirmado pela lista de imports (linhas 1-52) e pela leitura integral do JSX. O wrapper que a tela usa, `WorkbenchEditorLayout` (`frontend/src/features/editor/WorkbenchEditorLayout.tsx:21-30`), só monta `leftPanel` + `children` + `rightPanel`; não injeta header/stepper algum. O conteúdo da aba começa direto no player (linha ~510).
- **Precisão sobre o componente-referência:** `PosTopbarExtra` (`frontend/src/features/editor/PosTopbarExtra.tsx`) existe e é usado **hoje só em `ScenesPostProductionPage.tsx`** (via slot `extra` do `CommonTopBar`) — não em Bruto, não em Revisão. E os 4 passos que ele implementa **hoje** (`STEPS`, `PosTopbarExtra.tsx:86-91`) são **`1 Metadados · 2 Cenas · 3 Validar · 4 Renderizar`** — não `1 Bruto → 2 Cenas → 3 Grade → 4 Final` como o DE-PARA.md §4 descreve na coluna "Hoje" (`PosTopbarExtra (steps 1 Bruto → 2 Cenas → 3 Grade → 4 Final; VideoTipo)`). Ou seja: o componente existe, mas com uma semântica de passos **diferente** da que a Regra 0 propõe generalizar (é uma sub-navegação *dentro* da tela de Pós, não um estágio *entre* telas). Reaproveitar `PosTopbarExtra` como está não produz a barra pedida; seria preciso um componente novo ou uma generalização do conceito.
- Existe, isso sim, um modelo de **estágio cross-tela** no domínio: `resolveCorteStagePath` (`frontend/src/features/post-production/postProductionNavigation.ts:53-68`) decide para qual rota um corte aponta a partir de `arquivo_clip_path` / `is_pos_producao` / `exportStatus` — mas é um modelo de **3 destinos** (`rawEditorPath` → Bruto, `postProductionPath` → Pós, `finalReviewPath` → Final), não 4; "Cenas" e "Grade" são sub-fases *dentro* de Pós, sem rota própria. Hoje esse resolver só é usado para decidir o link ao clicar num card de corte (ex.: `getCortePath` do `WorkbenchCutsPanel`, `FinalReviewPage.tsx:498-504`), nunca para renderizar uma barra visível.
- (b) **Faz sentido a barra permitir voltar direto a "2 Cenas"/"3 Grade" na Revisão?** Do ponto de vista de rotas, "Cenas" já é navegável isoladamente (`postProductionPath(projetoId, corteId, forcePhase2=true)`). "Grade" **não é uma tela/rota própria** — é uma fase dentro do pipeline de render (`FaseRender = 'grade' | 'overlays' | 'render_final'`, `renderEtapas.ts:14`), hoje só alcançável através do modal de re-renderização (ver §2.3). Ou seja, a peça de domínio para "ir direto pra Grade" **já existe** (é a mesma seleção `startFrom:'grade'` que `RenderStepsModal` já oferece) — falta só expor esse mesmo mecanismo como destino clicável de uma barra de etapas, e não só dentro do botão "Re-renderizar".
- (c) **O que falta para bater com a Regra 0:**
  1. Um componente de barra de etapas cross-tela (estágio do corte, não sub-navegação de Pós) — inexistente hoje em qualquer tela do pacote.
  2. Renderizá-lo no topo do conteúdo da aba em `FinalReviewPage.tsx` (branch Workbench), antes do player.
  3. Decidir a granularidade de "Grade" como destino clicável — plausivelmente resolvido abrindo `RenderStepsModal` com `startFrom:'grade'` pré-marcado, no mesmo espírito do que "Re-renderizar" já faz (§2.3).
  4. Reconciliar com `PosTopbarExtra` (rótulos e propósito diferentes hoje) e com `resolveCorteStagePath` (só 3 destinos) — este item é maior que o escopo desta tela sozinha; afeta as 5 telas do pacote igualmente.

> **Definição confirmada (fonte: `telas/README.md` do pacote Claude Design, 19/07, e `AUDITORIA-v3-pos-producao.md` §3, ambos sincronizados na worktree após esta análise ter sido escrita):** a Regra 0 tem **5** segmentos — `Workspace → Bruto → Pós → Metadados → Revisão` — não os 4 passos do `PosTopbarExtra` nem os 3 destinos de `resolveCorteStagePath`. Rótulos/cores/rotas já existem prontos em `components/workbench/workbenchRoutes.ts` (`ETAPA_LABELS`, `ETAPA_DOT_TOKENS`, `tabPath`). O `PosTopbarExtra` **fica como está** (decisão de design confirmada: manter Metadados/Cenas/Validar/Renderizar como sub-passos internos da Pós, sem virar a Regra 0). Ponto de implementação recomendado: **um único componente em `components/workbench/WorkbenchShell.tsx`** (entre `<TabStrip/>` e o `<div className="flex min-h-0 flex-1">`), lendo `activeTab` do `WorkbenchTabsProvider` — cobre as 5 telas de uma vez, sem tocar `FinalReviewPage.tsx` individualmente. Item 3 acima ("Grade" como destino clicável via `RenderStepsModal` com `startFrom:'grade'`) continua válido como refinamento posterior, independente desta barra macro.

---

## 2. O que já está feito

### 2.1 Header "Vídeo final"

**FEITO.** `FinalPlayerPanel` (`FinalReviewPage.tsx:736-810`), reaproveitado tanto no branch Workbench (linhas 519-529) quanto no legado:

| Elemento do briefing | Estado | Referência |
|---|---|---|
| Label "VÍDEO FINAL" | FEITO | `FinalReviewPage.tsx:758-760` |
| Chip `1920×1080 · 29.97fps · h264` | FEITO, com ressalva | `FinalReviewPage.tsx:761-763` — string **fixa** no JSX, não deriva de metadata real do arquivo (ex. via ffprobe). Correto hoje porque o pipeline sempre renderiza nesse formato, mas não se autoatualiza se o formato de saída mudar. |
| Chip de filtro/grade aplicado (D-367) | FEITO | `FinalReviewPage.tsx:764-772`, dinâmico (`settingsQ` + `filtrosQ`). Confirmado na captura `05-revisao-final.jpg`: mostra "BYPASS DOURADO (COMPLETO)". |
| ⬇ MP4 | FEITO | `FinalReviewPage.tsx:774-784`, link de download direto (`finalVideoUrl`). |
| 📁 Pasta | FEITO | `FinalReviewPage.tsx:785-796`, `useAbrirPasta`. |

### 2.2 Vídeo final reduzido

**FEITO, com divergência de fórmula a registrar.** O player tem cap de altura (não deixa o vídeo estourar verticalmente e esconder o resto da tela) tanto no branch Workbench quanto no legado. Porém a fórmula usada é uma **terceira variante**, diferente tanto do que o briefing cita de AUDITORIA-v2 (`height:clamp(170px,36vh,360px)`) quanto do helper compartilhado do próprio pacote Workbench:

| Onde | Fórmula | Referência |
|---|---|---|
| `FinalReviewPage.tsx` (branch Workbench) | `width:'min(100%, calc((100vh - 380px) * 1.7778))'` | `FinalReviewPage.tsx:511-517` — cálculo próprio, não chama `PlayerCap` |
| `PlayerCap` (helper compartilhado, usado por Bruto/fase1) | `width:'min(100%, calc(44vh * 16 / 9))'`, `maxHeight:'44vh'` | `WorkbenchEditorLayout.tsx:44-60`, comentário cita "AUDITORIA-v2 §4 (CP4)" |
| `README.md` (fórmula geral do shell) | `width:min(100%, calc((100vh - 330px)*16/9))` | `README.md:44` |

As três produzem resultados visuais parecidos mas não idênticos, e a Revisão final não reaproveita o helper `PlayerCap` que Bruto usa — cada tela resolveu o "player 16:9 com cap" à sua própria maneira.

### 2.3 Ações — inclui a resposta sobre "re-renderizar com escolha de etapa"

| Ação (briefing) | Estado | Detalhe |
|---|---|---|
| ✓ Aprovar e publicar | **PARCIAL** | Ver §3.1 — só aprova, não publica. |
| ↩ Voltar para pós | FEITO | `navigate(`/projetos/${projetoId}/post-production?corte=${corte.id}`)`, `FinalReviewPage.tsx:557-563`. |
| ⟳ Re-renderizar | **FEITO** | Ver detalhamento abaixo — é a pergunta central do briefing. |
| canal + agendar | **PARCIAL** | Ver §3.3 — só "agendado" existe; "canal" não. |

**Re-render com escolha de etapa — investigado a fundo, resposta = cenário (c) do briefing (já reaproveita `RenderStepsModal`), não (a) nem (b).**

1. O botão "Re-renderizar" (workbench: `FinalReviewPage.tsx:566-575`; legado: item do menu `⋯`, `:367-371`) chama `renderizarNovamente()` (`:249-259`):
   ```
   async function renderizarNovamente() {
     ...
     const status = (await pipelineStatus.refetch()).data;
     if (status?.running) return;
     if (status?.tem_etapas_concluidas) {
       setRenderStartModalOpen(true);   // ← abre o seletor de etapas
       return;
     }
     startRenderFinal({ startFrom: 'grade' });  // nada concluído ainda: só uma opção possível
   }
   ```
2. O modal aberto é `RenderStepsModal`, **importado diretamente** de `@/features/post-production/RenderStepsModal` (`FinalReviewPage.tsx:45`, uso em `:469-474`) — **mesmo componente da Pós, sem fork**.
3. `RenderStepsModal` deixa marcar um intervalo contíguo de fases (`Grade` / `Overlays` / `Render final`, `renderEtapas.ts:14,28-36`), com atalhos "Continuar de onde parou" e "Reprocessar tudo", texto de resumo (`descreverRequest`) e bloqueio de seleção inválida (`faseSelecionavel` — não deixa começar por Overlays/Render final sem Grade pronta). Toda essa lógica é **pura e testada** (`post-production/__tests__/renderEtapas.test.ts`).
4. Essa peça é **anterior ao redesign Workbench** — `RenderStepsModal.tsx` e `renderEtapas.ts` não têm nenhum commit além do squash inicial `67cb27b` ("versão inicial pública v0.1.0", D-277). D-391 (`7d99ccc`) só **conectou** o botão já existente ao shell novo — a própria mensagem do commit diz "lógica intocada".
5. Ressalva de comportamento: o seletor só abre quando `status?.tem_etapas_concluidas` é verdadeiro; se nada foi renderizado ainda, dispara direto `startFrom:'grade'` (não há nada anterior para escolher — comportamento correto, não é uma lacuna). Como a Revisão final só é alcançada por cortes com vídeo pronto (`isCorteVideoPronto`), na prática quase todo clique em "Re-renderizar" a partir desta tela vai ter etapas concluídas e vai abrir o modal.

**Conclusão sobre este ponto:** ao contrário da hipótese levantada no briefing ("provavelmente o maior gap desta tela"), o re-render com escolha de etapa **já existe e funciona**, reaproveitando uma peça madura e testada. O maior gap real da tela, por evidência de código + captura de tela, é a trilha Layout YT (§3.2) e a ausência total da barra de etapas (§1).

### 2.4 Timeline · Cenas + Layout YouTube

Componente `SceneTimeline` (`frontend/src/features/editor/fase2/SceneTimeline.tsx`) — **mesmo componente usado na Pós** (`EditorFase2.tsx:570-579`), controlado por `readOnly`/`seekable`. Nenhum fork.

| Elemento do briefing | Estado | Referência |
|---|---|---|
| Header com badges "N cenas ✓" / "palco gerado ✓" | **FEITO** (D-396, `e777d5e`, commit de hoje 19/07, já fechado) | `SceneTimeline.tsx:589-614`. `FinalReviewPage.tsx` deriva as flags de `exportStatusAtual?.overlays_prontos` (cenas) e `exportStatusAtual?.grade_pronta` (palco), linhas 109-117, 630-631. Testado em `fase2/__tests__/SceneTimeline.badges.test.tsx` (4 casos: neutro, cada prop isolada, e as duas independentes). Confirmado visualmente na captura `05-revisao-final.jpg`: badges "✓ 9 CENAS" e "✓ PALCO GERADO" em verde. |
| Transporte (playhead cruzando as trilhas) | FEITO | `SceneTimeline.tsx:710-725`, sincronizado com o `<video onTimeUpdate>` via `currentTime` (D-365, `FinalReviewPage.tsx:118-122,804`). |
| Zoom | **Ausente por design, não é lacuna** | Controles de zoom só renderizam quando `!readOnly` (`SceneTimeline.tsx:616`) — comentário no próprio arquivo confirma que é intencional ("Quando `readOnly` (Final), zoom... somem", linhas 31-32). A Revisão usa `readOnly + seekable`, então navega (clique/arrasto) mas não zoom. |
| Trilha CENAS clicável por tipo | FEITO | Blocos coloridos por `sceneTypeStyle`/`SceneTypeIcon`, clicáveis via `seekable` mesmo em `readOnly` (`podeNavegar = !readOnly \|\| seekable`, `SceneTimeline.tsx:320,754-813`). |
| Trilha LAYOUT YT com a barra do palco | **FALTA — gap concreto, ver §3.2** | |
| Eixo de tempo | FEITO | Régua de timecodes, `SceneTimeline.tsx:997-1009`. |

### 2.5 Painel retrátil

**FEITO, parcial por design.** A tela usa `PanelShell` só do lado **esquerdo**, via `WorkbenchCutsPanel` (`FinalReviewPage.tsx:490-506`, `WorkbenchCutsPanel.tsx:80-97`, que internamente monta `<PanelShell id="cuts" side="left" .../>`). Não há painel direito — `WorkbenchEditorLayout` é chamado sem `rightPanel` (`FinalReviewPage.tsx:490`), consistente com o DE-PARA §5 (que só descreve player + ações, sem painel de ferramentas à direita nesta tela).

---

## 3. O que falta

### 3.1 "Aprovar e publicar" só aprova (não publica)

- **Arquivo:** `FinalReviewPage.tsx:336-350` (`aprovarCorte`) e `:544-556` (botão, texto "Aprovar e publicar").
- `aprovarCorte()` só faz `atualizarCorte.mutate({ status: 'aprovado' })`. Não há chamada a nenhum endpoint de publicação/upload.
- Confirmado: o hook real de upload para o YouTube, `useUploadYouTube` (`hooks/useProjetoDetalhe.ts:184-188`), é usado **só em `ProjetoDetalhePage.tsx`** (Workspace) — nunca em `FinalReviewPage.tsx`. Publicar de fato hoje é uma jornada separada (Workspace → "▶ Publicar em massa", `PublicarMassaModal.tsx`), não acionável a partir da Revisão.
- **Ação sugerida:** decidir entre (a) o botão disparar publish real além de aprovar, (b) renomear para só "Aprovar" e deixar publicar como jornada separada documentada, ou (c) manter o rótulo e adicionar a chamada de publish condicionada a canal/agendamento definidos.

### 3.2 Trilha Layout YT pode ficar vazia mesmo com "palco gerado ✓"

- **Arquivo:** `FinalReviewPage.tsx:622` (branch Workbench) e `:454` (mesma lacuna no shell legado, `conteudoFinal`).
- O prop `layoutYoutube` passado ao `SceneTimeline` é `(corte as unknown as { layout_youtube?: never }).layout_youtube` — o valor **cru** de `corte.layout_youtube`, sem nenhum cascade.
- Comparação com a Pós: `EditorFase2.tsx:150-158` resolve o mesmo dado com `resolveLayoutChain(corte.layout_youtube, projeto?.layout_youtube_padrao, appSettings?.youtube_layout_padrao_global)` (`youtubeLayout.ts:124-132`), que cascateia corte → projeto → global e **sempre** devolve um `YoutubeLayout` completo (nunca `undefined`).
- Como `SceneTimeline` lê `layoutYoutube?.regioes ?? []` direto (`SceneTimeline.tsx:311`), um corte cujo modo "compartilhada" vem só do padrão do projeto/global (sem `regioes` explícitas gravadas no corte) resulta em trilha vazia na Revisão, mesmo quando a Pós mostraria os blocos corretamente.
- **Confirmado visualmente**: na captura `capturas/v2/05-revisao-final.jpg`, o header da timeline mostra "✓ PALCO GERADO" (sucesso), mas a trilha "LAYOUT YT" abaixo está **vazia** — nenhum bloco de região desenhado. Isso é evidência concreta (não especulativa) do gap: o badge (agregado do backend, `grade_pronta`) e a trilha (derivada do `layoutYoutube` cru) estão dessincronizados.
- **Fix sugerido:** aplicar `resolveLayoutChain` também em `FinalReviewPage.tsx`, usando dados já buscados no componente (`projeto` via `useProjeto`, linha 78; `settingsQ` via `useQuery(['app-settings'], api.obterSettings)`, linha 96) — mesmo padrão de `EditorFase2.tsx:150-158`. Nota lateral: o cast `{ layout_youtube?: never }` é enganoso (declara um tipo que nunca existe); `EditorFase2.tsx:153` usa `{ layout_youtube?: unknown }`, mais honesto.

### 3.3 Info "canal" ausente; agendamento sem formatação

- **Arquivo:** `FinalReviewPage.tsx:597-601`.
- Existe só a metade "agendamento" do par "canal/agendamento" citado no DE-PARA §5: chip `agendado · {exportStatusAtual.youtube_scheduled_at}` — string ISO **crua**, sem formatação de data. Confirmado na captura: "agendado · 2026-05-30T00:28:00Z".
- Nenhuma referência a "canal" (nome/handle do canal ativo) foi encontrada em `FinalReviewPage.tsx`. Dado que o app opera com um canal ativo por vez (`identidade_do_canal_ativo`), o valor de mostrar canal por-corte nesta tela é uma decisão de produto a confirmar com o Paulo — não dá pra saber a intenção exata sem o AUDITORIA-v2 original.

### 3.4 Regra 0 — barra de etapas (repetido aqui para a lista acionável)

- Ver §1 para a análise completa. Arquivo-alvo: novo componente + inserção no topo do `children` de `WorkbenchEditorLayout` em `FinalReviewPage.tsx` (branch Workbench, antes da linha 510).

### 3.5 Player não reaproveita o helper `PlayerCap`

- Ver §2.2. Não é um bug funcional (o cap de altura funciona), é dívida de padronização: `FinalReviewPage.tsx:511-517` tem fórmula própria em vez de importar `PlayerCap` de `WorkbenchEditorLayout.tsx`.

### 3.6 Sem testes dedicados da página

- `frontend/src/features/final-review/` não tem pasta `__tests__`. O que existe testado são as peças reaproveitadas (`SceneTimeline.badges.test.tsx`, `renderEtapas.test.ts`) e testes de roteamento indiretos (`workbenchRoutes.test.ts`, `postProductionNavigation.test.ts`). A integração da própria página — `renderizarNovamente` abrir o modal certo conforme `tem_etapas_concluidas`, `aprovarCorte`, seleção automática de corte ao entrar sem `corteId` (linhas 127-137) — não tem cobertura própria.

### 3.7 Chip de resolução fixo no JSX

- Ver §2.1. `"1920×1080 · 29.97fps · h264"` (`FinalReviewPage.tsx:762`) é texto literal, não deriva de metadata real do arquivo renderizado. Baixo risco hoje (o pipeline sempre renderiza nesse formato), mas não se autocorrige se o formato de saída mudar.

### Nota sobre locks

`FinalReviewPage.tsx` e `SceneTimeline.tsx` estão sob as travas `f024-final-readonly`, `f024-pos-scene-timeline` e `post-production-video-routing` (destravadas pontualmente em `7d99ccc`/`e777d5e` com `[unlock:...]`). Qualquer implementação dos itens acima passa pelo protocolo de lock padrão do projeto (`.guia/locks/registry.yaml`).

---

## 4. Checklist final

Baseado no que o commit `e777d5e` descreve como CP11 (badges de sucesso) mais os pontos novos identificados nesta auditoria:

- [x] Header "Vídeo final" com chip de resolução, filtro aplicado, MP4, Pasta (`FinalPlayerPanel`)
- [x] Player 16:9 com cap de altura (funciona; fórmula própria — não reaproveita `PlayerCap`, §3.5)
- [x] Ação Aprovar (muda status do corte)
- [ ] Ação "publicar" real associada ao botão "Aprovar e publicar" (§3.1)
- [x] Ação Voltar para pós
- [x] Ação Re-renderizar com escolha de etapa — `RenderStepsModal` reaproveitado da Pós, seleção contígua Grade/Overlays/Render final (§2.3)
- [x] Chip de agendamento quando `youtube_scheduled_at` existe (sem formatação de data, §3.3)
- [ ] Info de canal (§3.3)
- [x] Timeline: badges de sucesso "N cenas ✓" / "palco gerado ✓" (D-396/CP11)
- [x] Timeline: trilha Cenas clicável por tipo, playhead cruzando as trilhas, eixo de tempo
- [ ] Timeline: trilha Layout YT populada de fato (cascade `resolveLayoutChain` ausente, §3.2 — gap confirmado por captura de tela)
- [x] Painel retrátil "CORTES" à esquerda (`PanelShell` via `WorkbenchCutsPanel`); sem painel direito, por design
- [ ] Barra de etapas do corte (Regra 0) nesta tela (§1)
- [ ] Testes dedicados de integração de `FinalReviewPage.tsx` (§3.6)
- [ ] Chip de resolução dinâmico em vez de texto fixo (§3.7, baixa prioridade)
