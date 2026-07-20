# 01 — Bruto (Editor de cortes)

## 1. Escopo

- **Rotas:** `/projetos/:id/cortes` e `/projetos/:id/cortes/:corteId`.
- **Componente raiz:** `frontend/src/features/editor/EditorPage.tsx`, ramo `isWorkbenchEnabled()` (linha 664 em diante). O ramo legado (linha 966 em diante — `UnifiedSidebar` + `CommonTopBar` + `EditorFase1`) é o fallback com a flag desligada e **não** faz parte deste diagnóstico, exceto quando citado para contraste.
- **Componentes cobertos:** `WorkbenchEditorLayout.tsx` (+ `PlayerCap`), `WorkbenchCutsPanel.tsx`, `PanelShell.tsx`, `RetractableFooter.tsx`, `useWorkbenchPanels.ts`, `fase1/PlayerPanel.tsx` (`variant="overlay"`), `fase1/AudioSyncControl.tsx` (`variant="workbench"`), `fase1/BrutoContextStrip.tsx` (`variant="workbench"`), `fase1/TimelinePanel.tsx` (`variant="workbench"`), `fase1/RightTabsPanel.tsx` (`variant="workbench"`), `BrutoStepsDropdown.tsx`, `CommonTopBar.tsx` (só `StatusToggleRow`/`StatusToggleCompact`, reaproveitados fora do `CommonTopBar` em si), `shortcutsRegistry.ts`.

### Nota de rastreabilidade (fontes)

`AUDITORIA-v2.md` — apontado como estando em `frontend/design_handoff_workbench/` na worktree — **não estava presente** nem na worktree nem no checkout principal no início desta análise (só existiam `DE-PARA.md`, `PLANO-DE-ETAPAS.md`, `README.md`, `ATALHOS-E-CONFIGURACOES.md` e 2 `.dc.html`, todos `??` no `git status` do checkout principal). O arquivo foi localizado e lido por completo no projeto Claude Design **"Redesign de interface web"** (`project_id 55375336-e0c5-4075-a9ef-3a3884897577`), junto com `AUDITORIA-IMPLEMENTACAO.md` (18/07) e um `telas/README.md` mais recente (19/07) com a definição atualizada da Regra 0 (ver §2). Nenhum desses três estava sincronizado em disco até o meio desta tarefa — passaram a existir na worktree (`git status` os marca `??`) só depois de uma sincronização que ocorreu **durante** esta análise (confirmado pelo timestamp: `AUDITORIA-v2.md` apareceu às 21:27, os demais às 21:25 de hoje). O conteúdo do arquivo agora presente na worktree foi conferido byte a byte (mesmo tamanho, 17881 bytes) contra o que foi lido do Claude Design — são idênticos. Todo o restante deste documento (código, commits, diffs) foi lido **na worktree**, como instruído. Capturas conferidas: `capturas/v2/03-bruto.jpg` e `03-bruto-escuro.jpg` (tema claro/escuro, anteriores às mudanças de hoje, mas estruturalmente compatíveis com o código atual).

Convenção de status: **FEITO** (funcionando, ainda que em commit não fechado/validado) · **EM ANDAMENTO** (mudança de hoje, não commitada, tocando o item agora) · **FALTA** (não existe ou não bate com o hand-off).

---

## 2. Regra 0 — barra de etapas do corte

**(a) Existe hoje algum indicador de etapas visível nesta tela? Não.**

Fui checar especificamente a hipótese do brief — que `BrutoStepsDropdown` (citado no `DE-PARA.md` §3) teria sido removido e por isso a tela ficou sem indicador. A hipótese está **parcialmente errada**: `BrutoStepsDropdown.tsx` não foi removido — continua importado e renderizado em `EditorPage.tsx:47,767-779`, agora controlado de fora pelo ícone ⟳ da toolbar (`open`/`onOpenChange`/`hideTrigger`, comentário "AUDITORIA-v2 §2 (CP2)" em `BrutoStepsDropdown.tsx:69-76`). Só que ele **nunca foi** um indicador de etapas do pipeline do corte — é um popover com os passos de **processamento do bruto em si** (silêncios → renderizar vídeo → sincronizar transcrição → gerar cenas → gerar metadados, `BrutoStepsDropdown.tsx:28-33,43-48`), sem relação com navegação Bruto/Pós/Metadados/Revisão. Ou seja: o componente sobreviveu, só que resolvendo um problema diferente do que a Regra 0 pede.

Inventariei todos os candidatos que poderiam ter esse papel e nenhum cobre a tela Bruto:

| Componente | Nível | Onde aparece | Cobre o Bruto? |
|---|---|---|---|
| `PosTopbarExtra`/`PosStepperBar` (`features/editor/PosTopbarExtra.tsx:86-91`) | Corte, dentro da fase Pós | Só `ScenesPostProductionPage.tsx:409,498` (confirmado por grep — nenhuma outra tela importa) | Não |
| `UnifiedSidebar` — NavItems Bruto/Pos/Final (`UnifiedSidebar.tsx:223-258`) | Corte, 3 destinos (falta Metadados) | Só no ramo **legado** (flag desligada) | Não no Workbench — e mesmo no legado, incompleto (3 de 5 destinos) |
| `WorkbenchCutsPanel` (substituto do `UnifiedSidebar` no Workbench) | — | Removeu essa navegação de propósito: "A navegação por fases saiu (virou aba do shell)" (`WorkbenchCutsPanel.tsx:15-19`) | Não, por decisão explícita registrada no próprio comentário |
| `ProjectRail`/`PipelineProgress` (rail global) | **Projeto** (agregado de todos os cortes) | Sempre visível, mas granularidade diferente — "em que pé está o projeto", não "em que etapa está ESTE corte" | Não é a mesma pergunta |
| `StatusPills` (`features/projeto-detalhe/StatusPills.tsx`, usado por `CorteCard.tsx`) | Corte | Só no Workspace legado, tokens não migrados, só tooltip (achado paralelo, ver `telas/05-metadados.md` §2b) | Não |
| `etapasDoCorte` (`ProjetoDetalhePage.tsx:570-608`) | Corte | Só no Workspace, 5 ícones somente-leitura (achado paralelo, ver `telas/04-projetos.md` §1) | Não |

Confirmado também visualmente em `capturas/v2/03-bruto.jpg`: nenhuma barra de etapas aparece na tela.

**Conclusão (a):** a tela Bruto está, hoje, sem qualquer indicador de em que etapa do pipeline do corte o usuário está e sem atalho para pular para Pós/Metadados/Revisão sem sair do corte atual.

**(b) Se existisse, seria navegável?** Não se aplica — não existe.

**(c) O que falta para bater com a Regra 0**

O enunciado desta tarefa descreveu o alvo como os chips de 4 passos do `PosTopbarExtra` ("1 Bruto ✓ → 2 Cenas → 3 Grade → 4 Final"). Encontrei uma definição **mais recente e mais precisa** da Regra 0 no `telas/README.md` do pacote Claude Design (datado 19/07/2026, "Regra transversal 0 — OBRIGATÓRIA"), que diverge do enunciado em dois pontos: (1) são **5** destinos, não 4 — `Workspace → Bruto → Pós → Metadados → Revisão`; (2) os rótulos reais de `PosTopbarExtra.tsx:86-91` já hoje são `Metadados → Cenas → Validar → Renderizar`, não `Bruto/Cenas/Grade/Final` — essa sequência não existe em nenhum lugar do código-fonte atual (achado confirmado de forma independente também em `telas/05-metadados.md` §2b). **Vale alinhar com o Paulo qual dos dois modelos (4 ou 5 passos, quais rótulos) é o alvo antes de implementar** — os dois concordam só no espírito (barra sempre visível, clicável, segmento atual destacado).

> **Resolvido após esta seção ter sido escrita:** `AUDITORIA-v3-pos-producao.md` §3 (sincronizada na worktree logo depois desta análise) responde exatamente essa pergunta: *"manter os 4 rótulos reais [Metadados/Cenas/Validar/Renderizar] — são funcionais, e a aparência atual do PosStepperBar já está correta. O protótipo é que será atualizado."* Ou seja, o `PosTopbarExtra` **não** é a Regra 0 nem deve virar uma — ele continua sendo a sub-navegação própria da Pós, sem mudança. A Regra 0 (5 segmentos `Workspace/Bruto/Pós/Metadados/Revisão`) é um componente **novo e separado**, exatamente como recomendado acima (`WorkbenchShell.tsx`, uma vez, lendo `activeTab`). Ambiguidade fechada — não é mais uma decisão em aberto.

A boa notícia: a infraestrutura de dados para a versão de 5 segmentos **já existe e não é usada para isso**:
- `components/workbench/workbenchRoutes.ts:47-53` → `ETAPA_LABELS` (`Workspace`/`Cortes`/`Pós`/`Metadados`/`Revisão`)
- `workbenchRoutes.ts:56-62` → `ETAPA_DOT_TOKENS` (cor por etapa, já semântica: `--wb-accent` cortes, `--wb-warn` pos, `--wb-fire` metadados, `--wb-info` revisao)
- `workbenchRoutes.ts:10-25` → `tabPath()` (etapa + `projetoId` + `corteId?` → rota)
- `WorkbenchTabsProvider` (`useWorkbenchTabsContext().activeTab`) já carrega `{projetoId, etapa, corteId}` da aba ativa — dado suficiente para montar a barra sem duplicar lógica de rota.

**Caminho recomendado** (mais barato que duplicar em 5 páginas): adicionar a barra **uma vez** em `components/workbench/WorkbenchShell.tsx`, entre `<TabStrip/>` (linha 86) e o `<div className="flex min-h-0 flex-1">` (linha 87), lendo `activeTab` do `WorkbenchTabsProvider`. Cobre as 5 telas de uma vez, sem tocar `EditorPage.tsx`. Alternativa (replicando o único padrão já usado hoje, só em Pós): reproduzir `ScenesPostProductionPage.tsx:408-414` (`PosTopbarExtra` dentro do `children` de `WorkbenchEditorLayout`) — duplicaria a barra em 5 arquivos em vez de 1.

Um rascunho anterior não sincronizado (Claude Design, versão prévia deste mesmo arquivo) cogitou resolver isso estendendo os `NavItem` do `UnifiedSidebar` para 5 itens verticais — essa rota está desalinhada com o código atual, já que `UnifiedSidebar` não é mais renderizado na tela Bruto do Workbench (só no legado); não recomendo seguir por ali.

---

## 3. O que já está feito

Tudo abaixo está na worktree, no ramo `isWorkbenchEnabled()`. Numeração de seção = `AUDITORIA-v2.md` real (recuperada via Claude Design, texto verbatim — ver nota de fontes).

### §1 — Shell / layout de 4 colunas — FEITO
Commit `7f3dddf` (D-396, "fundacao de tokens -ink e fila global colapsada por padrao") para o CP1 (fila), demais colunas herdadas das Etapas 0-3 (D-386...D-390).
- `WorkbenchEditorLayout.tsx:21-30` monta `leftPanel | children | rightPanel`; `EditorPage.tsx:667-712` registra `panelIds:['cuts','right']`.
- `PlayerCap` (`WorkbenchEditorLayout.tsx:44-60`) implementa o teto do centro via `max-height:44vh`/`min-height:0` — bate com a regra global "centro nunca < 420px" (o `minWidth:'min(100%,420px)'` da própria função é o piso).
- `useWorkbenchPanels.ts:48-56` — `DEFAULT_OPEN_STATE.fila = false` (comentário "CP1 (AUDITORIA-v2 §1/§12)"), com teste dedicado (`useWorkbenchPanels.test.ts:44`, `it('CP1: fila global vem colapsada por padrão...')`).
- Larguras reais (`useWorkbenchPanels.ts:22-31`) batem com o hand-off **na maioria**, com 2 desvios pequenos e 1 maior — ver §4.

### §2 — Toolbar do Bruto (veredito + ferramentas) — FEITO
Commits `4382c1c` (toolbar de ícones) + `933a15a` (cores fixas do veredito).
- `EditorPage.tsx:718-864` monta a linha única exatamente na ordem do hand-off: veredito (✓✕🔥📖) → divisor → ⟳ regerar → 📁 abrir pasta → 🕑 tempos → 🎧 sincronia → ℹ️ tooltip → chips "Vídeo original · 4K"/"corte de Xm" → spacer → Salvar.
- Encolhimento proporcional **byte-a-byte igual ao pedido**: `icon-button.tsx:26`, size `toolbar` = `'aspect-square min-w-[26px] flex-[0_1_38px] rounded-[9px]'` — é exatamente `aspect-ratio:1; flex:0 1 38px; min-width:26px; border-radius:9px` do §2, com o comentário "AUDITORIA-v2 §2" na própria linha 23-25.
- Cores fixas por ação (não por estado) também batem exatamente: `StatusToggleCompact` com `iconOnly` (`CommonTopBar.tsx:210-229`) usa `activeVariant` fixo por botão — Aprovar `"ok"`, Rejeitar `"err"`, Fire `"fire-soft"`, Leitura `"inset"` (`EditorPage.tsx` via `StatusToggleRow`) → `icon-button.tsx:38-43` mapeia esses variants para `--wb-ok`/`--wb-err`/`--wb-fire-soft`+`--wb-fire`/`--wb-inset`+`--wb-border`, idêntico à tabela do §2. Tamanhos de ícone também batem: Aprovar 16px (`iconSize={16}`), demais 15px (default) — a auditoria pede exatamente isso.
- Tooltip do ℹ️ (`EditorPage.tsx:820-825`, atributo `title`) tem o texto pedido: "Aprovar A · Rejeitar R · Fire F · In/Out [ ] · Navegar ←→ 5s · Desfazer Ctrl+Z" (só `⌘Z`→`Ctrl+Z`, esperado em Windows).
- Botão de atalhos (⌨) **removido da tela** como pedido — não há mais gatilho visível no toolbar do Workbench; `ShortcutsHelpModal` só abre por atalho de teclado (`bruto.mostrarAtalhos`) ou pelo item "Atalhos" do rail global.

### §3 — Salvar flutuante — FEITO
Commit `4382c1c`.
- `EditorPage.tsx:836-863`: último filho `flex-none` da mesma linha do toolbar (não `position:absolute`), `px-[11px] py-[7px]` (bate com "padding 7px 11px" do hand-off), dot 7×7px `--wb-warn` quando `isDirty`, texto "Salvar" `font-bold`/10.5px, atalho "Ctrl+S" mono 9px dim — todos os valores literais do §3 conferem.
- Dispara com clique e com `Ctrl+S` (`shortcutsRegistry.ts`, id `bruto.salvar`, `mod:'any'`).

### §4 — Player — FEITO
Commit `4382c1c`.
- `PlayerCap` (`WorkbenchEditorLayout.tsx:48-55`): `maxHeight:'44vh'`, `minHeight:0` — literal do hand-off.
- `PlayerPanel.tsx` `variant="overlay"` (linhas 128-186): sem header de texto, 3 chips sobre o vídeo — BRUTO topo-esq, velocidade topo-dir, timecode rodapé-esq, todos `bg-black/50` mono 9-10px (linhas 173-184).
- **Desvio observado (não bloqueante):** o chip de rodapé-esquerdo mostra `{segParaHms(inicioSeg)} / {segParaHms(fimSeg)}` — o intervalo **fixo** IN/OUT do corte (`PlayerPanel.tsx:181-183`) — enquanto o texto do §4 (`52:23 / 1:07:15`) sugere um par posição-atual/duração-total, ao vivo. Não é necessariamente um bug: o tempo ao vivo já aparece no cabeçalho da Timeline (`tempoLabel`, `TimelinePanel.tsx:1134`) — registrando para o Paulo decidir se quer unificar.

### §5 — Sincronia do áudio (oculta) — FEITO
Commit `1d336ee`. Sem mudanças hoje (arquivo ausente do `git status`).
- Oculta por padrão (`EditorPage.tsx:136-137`, `sincroniaAberta` nasce `false`), alterna pelo ícone 🎧 (`toggle-active` quando aberta).
- `AudioSyncControl.tsx` `variant="workbench"` (linhas 52-144): faixa `border-[var(--wb-accent)]`, label "SINCRONIA DO ÁUDIO", valor em caixa, botões −100/−10/+10/+100, slider, "⟲ resetar", "✕ fechar" — todos presentes.
- Nudge fino por teclado: `bruto.sincroniaNudgeMenos`/`Mais` = `Ctrl+,`/`Ctrl+.` (`shortcutsRegistry.ts:420-434`) chamando `nudgeSincronia`/`STEP_FINO=10ms` (`EditorPage.tsx:443-449`). Desvio de teclas: o hand-off original (comentário em `shortcutsRegistry.ts:415-417`) pedia `,`/`.` nus; a implementação usa `Ctrl+,`/`Ctrl+.` — decisão já registrada no próprio código-fonte, não é um gap.

### §6 — Linha de tempos / métricas (oculta) — FEITO
Commit `1d336ee`. Sem mudanças hoje.
- Oculta por padrão (`temposAbertos` nasce `false`), alterna pelo ícone 🕑.
- `BrutoContextStrip.tsx` `variant="workbench"` (linhas 79-145): grid de 6 campos na ordem exata do hand-off — Fim anterior, No corte, No original, Duração, **Líquido s/ tr.** (tom `ok`), Início próx (linhas 84-101) — e linha 2 com Título (input), Trechos (contagem) e botão "✂ Intervalo" (linhas 106-134).

### §7 — Timeline do Bruto (header + onda) — FEITO
Commits `f1dc21a` (refatoração grande, 440 linhas) + `94a485b` + `933a15a` (refinamentos de ícone/cor).
- Header reduzido (`TimelinePanel.tsx:1143-1239`): "TIMELINE" + tempo, `TransportGroup` (⏮◀▶▶⏭), pílulas **In**/**Out** (`--wb-ok-soft`/`--wb-err-soft`, linhas 1170-1193 — bate com o hand-off), cadeado, spacer, menu ⚙ (`Settings`, não `MoreVertical`, quando `variant="workbench"`, linha 815).
- Menu `AdvancedMenu` workbench (linhas 853-1028): grid de velocidade `[0.5,1,1.5,2]` clicável (linha 115, `SPEED_OPTIONS`) — bate exatamente —, zoom, dividir corte aqui, trecho aqui, atualizar onda, rodapé "Zoom X · Velocidade Y" (linha 1030-1032, literal do hand-off).
- **Desvios observados (não bloqueantes):** (1) o zoom no menu é implementado como dois botões +/− (linhas 884-907), não como o slider descrito no §7; (2) o menu carrega itens extras não listados no §7 (reprodução sem trechos, modo ponteiro, travar trecho) — preservando funcionalidade pré-existente, coerente com a regra geral "não remover o que já funciona" do `PLANO-DE-ETAPAS.md`.
- **Onda sonora (CP8) — o item que a própria auditoria chama de "o mais importante": já está com peaks reais, não SVG decorativo.** `TimelinePanel.tsx:212-402` usa WaveSurfer.js de verdade, carregando peaks pré-computados do backend via `fetchWaveformPeaks(waveformPeaksSrc)` (linha 384) — isto já valia antes desta rodada; o que mudou agora foi só densidade/cor: `barWidth:1.5`/`barGap:0.6` (vs. `2`/padrão no legado) e cor lida do token `--wb-text-dim` ao vivo do DOM (linhas 284-296, funciona claro e escuro). Faixa única, sem gap — confere com "SEM divisão no meio". Cursor sincronizado ao `currentTime` via `requestAnimationFrame` (linhas 404-468), zoom via `ws.zoom()` (linha 493, re-render de peaks, não bitmap esticado) — satisfaz também o critério crítico do `DE-PARA.md` §3 (drift <1 frame, zoom sem perda de resolução, nunca decorativo).

### §8 — Painel CORTES (2/3 lista + 1/3 ferramentas) — FEITO
Commit `32b4fe4` (+ testes `WorkbenchCutsPanel.test.tsx`).
- `WorkbenchCutsPanel.tsx`: lista rolável (`flex:1 min-h-0 overflow-y-auto`, linha 98) + rodapé retrátil `RetractableFooter` "FERRAMENTAS DO CORTE" fechado por padrão (`ferramentasOpen` nasce `false`, linhas 65,253-267).
- **Redução deliberada e já documentada no próprio commit** (não é um gap): a auditoria listava 5 ações candidatas pro rodapé; o código só coloca "✂ Adicionar corte manual". O comentário `WorkbenchCutsPanel.tsx:21-36` explica cada uma: "÷ dividir corte" já vive no menu ⚙ da Timeline (§7); "↕ reordenar" já é as setas ↑/↓ inline da própria lista; "⧉ duplicar corte" está fora de escopo (sem hook/endpoint, decisão do Paulo); "🗑 excluir corte" duplicaria 1:1 o botão R·Rejeitar do veredito (que já chama `useDeletarCorte` com confirmação).
- Colapsado: faixa vertical 40px com "CORTES · N/M" (`PanelShell.tsx` genérico, `title` recebido de `WorkbenchCutsPanel.tsx:83`).

### §9 — Painel TRECHOS/TRANSCRIÇÃO (2/3 + 1/3) — FEITO
Commit `32b4fe4` (+ teste `RightTabsPanel.test.tsx`, CP10).
- `RightTabsPanel.tsx` `variant="workbench"`: abas Trechos/Transcrição com contagem (linhas 129-145), lista `flex:1`, rodapé retrátil "MAIS AÇÕES" fechado por padrão (linhas 188-209).
- **Mesma redução deliberada e documentada** (comentário linhas 38-53): das 4 ações candidatas do hand-off, só "⟳ Regerar transcrição" foi pro rodapé. "⭐ Influenciar a capa" fica sempre visível (mudar seria alterar comportamento, fora de escopo); "🔍 Buscar" fica sempre visível no topo da aba Transcrição (uso frequente — "a etapa pediu 'só mover se fizer sentido' e aqui não fez"); "⤓ Exportar SRT" não existe (sem endpoint, decisão anterior a esta rodada).

### Primitivos compartilhados — EM ANDAMENTO (hoje, não commitado)
`components/ui/modal.tsx`, `card.tsx`, `input.tsx`, `claude-button.tsx` (+ `icon-button.tsx`, só 1 linha) estão migrando **hoje**, sem commit, de tokens legados (`--border`, `bg-surface-1`, `text-text-100/300`, `bg-bg-900/800`, `accent-500`) para `--wb-*`. Isso afeta visualmente os modais abertos a partir do Bruto: `ReadingModal` (dentro de `StatusToggleRow`, via `CommonTopBar.tsx`), `TrechosManualModal`, `AdicionarCorteModal`, `SettingsModal`. É a mesma varredura mecânica pedida em `AUDITORIA-IMPLEMENTACAO.md` §3 (18/07) — ver o que ainda falta dela no §4 abaixo.

**Nenhuma mudança funcional não commitada nos 4 arquivos específicos do Bruto hoje** (`CommonTopBar.tsx`, `EditorPage.tsx`, `fase1/PlayerPanel.tsx`, `fase1/TimelinePanel.tsx`) — conferido via `git diff`: as únicas alterações são a troca de sintaxe Tailwind `shadow-[var(--wb-shadow)]` → `shadow-[shadow:var(--wb-shadow)]` (sem o hint `shadow:`, a classe nunca chega a emitir a declaração `box-shadow` — mesmo fix do resto do pacote) e reformatação Prettier (quebra de linha). Zero mudança de comportamento ou aparência nesta tela hoje, fora da migração dos primitivos compartilhados acima.

---

## 4. O que falta

| # | O que | Arquivo-alvo | Detalhe |
|---|---|---|---|
| 1 | **Regra 0** — nenhuma barra de etapas do corte na tela | `components/workbench/WorkbenchShell.tsx` (entre linha 86 e 87) | Ver §2 completo acima — reaproveitar `ETAPA_LABELS`/`ETAPA_DOT_TOKENS`/`tabPath` de `workbenchRoutes.ts` e `activeTab` do `WorkbenchTabsProvider`. Precisa antes de tudo alinhar com o Paulo o modelo (4 ou 5 passos) — há duas fontes divergentes (enunciado desta tarefa vs. `telas/README.md` 19/07). |
| 2 | Atalho `wb.toggleTimelineTools` (tecla `T`, "expandir/recolher ferramentas da timeline") não está registrado em `shortcutsRegistry.ts` | `shortcutsRegistry.ts` | `ATALHOS-E-CONFIGURACOES.md` §2 pede esse atalho para a tela `bruto`; hoje a timeline workbench não tem esse tipo de recolhimento (o cabeçalho é fixo, "avançado" já mora atrás do menu ⚙) — avaliar se o atalho ainda faz sentido como descrito ou se o documento precisa de ajuste. |
| 3 | Tokens legados residuais em 2 arquivos consumidos pelo Bruto | `ShortcutsHelpModal.tsx:40,47` (`--border`, `bg-bg-900`, `bg-bg-800`, `text-text-100`) · `AdicionarCorteModal.tsx:115,124,145,154,177,185` (`text-text-300`, `--border`, `bg-bg-900`, `text-text-100`) | Ambos abertos a partir do Bruto (modal de atalhos e modal de adicionar corte manual). A migração de hoje cobriu só os primitivos (`modal.tsx`/`card.tsx`/`input.tsx`/`claude-button.tsx`), não estes 2 consumidores — listados em `AUDITORIA-IMPLEMENTACAO.md` §3 desde 18/07 e ainda não fechados. (`CorteStatusCard.tsx` também está na mesma lista, mas só é usado pelo `UnifiedSidebar` legado — não afeta esta tela no Workbench.) |
| 4 | Sem teste automatizado dedicado às variantes `workbench` de `StatusToggleRow`/`CommonTopBar` (§2/§3), `PlayerPanel` (§4), `AudioSyncControl` (§5), `BrutoContextStrip` (§6) e `TimelinePanel` (§7/§8) | — | Só têm teste citando o CP: `useWorkbenchPanels.test.ts` (CP1), `RetractableFooter.test.tsx` (CP9/CP10 genérico), `WorkbenchCutsPanel.test.tsx` (CP9), `RightTabsPanel.test.tsx` (CP10). Os 5 itens acima foram verificados só por leitura de código + captura de tela, não por teste automatizado. |
| 5 | CP13 (viewport 1600×900, nada truncado/sobreposto) não verificado nesta auditoria | — | Requer navegador/captura, fora do alcance de uma leitura de código. A captura de referência disponível (`capturas/v2/03-bruto.jpg`) é anterior às mudanças de hoje. |
| 6 | Desvios de fidelidade menores contra `AUDITORIA-v2.md` (não bloqueantes, registrar para ciência) | `useWorkbenchPanels.ts:22-31` · `TimelinePanel.tsx:884-907` · `PlayerPanel.tsx:181-183` | Rail colapsa a 62px em vez de 40px (§1 pede 40px pra TODO painel retrátil, sem exceção — o único painel fora do padrão); fila abre a 248px em vez de ~220px; zoom do menu ⚙ é botão +/− em vez de slider; chip de tempo do player mostra IN/OUT do corte, não posição-ao-vivo/duração-total. |

---

## 5. Checklist final (CP1–CP10 do `AUDITORIA-v2.md` §12 — escopo desta tela)

- [x] **CP1** — Shell/4 colunas do Bruto: centro `min 420px`, FILA colapsada 40px por padrão. *(ressalva: colapsado do rail é 62px, não 40px — item 6 de §4)*
- [x] **CP2** — Toolbar de ícones (veredito + ⟳/📁/🕑/🎧/ℹ) com encolhimento proporcional.
- [x] **CP3** — Salvar flutuante (último flex, Ctrl+S) + remover botão de atalhos da tela.
- [x] **CP4** — Vídeo largo (100% / `max-height:44vh`) com chips BRUTO/velocidade/tempo. *(ressalva: chip de tempo é IN/OUT fixo — item 6 de §4)*
- [x] **CP5** — Sincronia oculta atrás do 🎧 (faixa compacta).
- [x] **CP6** — Tempos ocultos atrás do 🕑 (grid de 6 campos) + botão ✂ Intervalo.
- [x] **CP7** — Timeline: header + transporte + menu ⚙ (velocidade/zoom/dividir/trecho). *(ressalva: zoom é botão, não slider — item 6 de §4)*
- [x] **CP8** — Onda sonora detalhada a partir dos peaks reais (faixa única, sem gap).
- [x] **CP9** — CORTES: lista rolável + rodapé retrátil "Ferramentas do corte". *(redução deliberada e documentada de 5→1 ação, ver §3)*
- [x] **CP10** — TRECHOS/TRANSCRIÇÃO: lista + rodapé retrátil "Mais ações". *(idem, 4→1, ver §3)*
- [ ] **CP11** — não é desta tela (Revisão final).
- [ ] **CP12** — Tokens `--wb-*` + tema claro/escuro: EM ANDAMENTO globalmente (primitivos hoje), mas 2 arquivos consumidos pelo Bruto ainda pendentes (item 3 de §4).
- [ ] **CP13** — Viewport 1600×900 sem cortes/sobreposição: não verificado nesta auditoria (item 5 de §4).
- [ ] **Regra 0** — barra de etapas do projeto: **FALTA** por completo nesta tela (item 1 de §4, detalhado em §2).
