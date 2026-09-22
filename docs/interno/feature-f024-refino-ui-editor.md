# F-024 · Refino UI do editor (hand-off de design v3)

## Contexto

Aplicacao do hand-off de design v3 (zip enviado por Paulo em `%TEMP%`)
no editor de cortes. Tres telas afetadas: **Bruto** (`features/editor/fase1`),
**Pos** (`features/editor/fase2`) e **Final** (read-only sobre componentes do
Pos/Bruto).

Hand-off composto por:
- `README.md` — visao geral + tokens + componentes globais (Sidebar/TopBar)
- `01_BRUTO.md` — detalhamento da tela de recorte
- `02_POS.md` — detalhamento Pos (Cenas / Layout YouTube / Filtros)
- `03_FINAL.md` — variante read-only
- `design_reference/src/*.jsx` — prototipos HTML/JSX (referencia visual,
  nao para copiar)

> Hand-off pede 100% da logica preservada. Esta feature so muda apresentacao.
> Hooks, mutations, contratos de dados — nada disso pode regredir.

## Estado dos arquivos travados (registry.yaml)

Paulo liberou todos os arquivos frontend desta feature. Cada commit que tocar
arquivo travado leva `[unlock:<id>] motivo: ...` na mensagem.

Travas afetadas:
- `post-production-video-routing` — `EditorPage.tsx`, `ScenesPostProductionPage.tsx`,
  `FinalReviewPage.tsx`, `postProductionNavigation.ts` + 2 testes
- `remotion-v2-card-contracts` — `cardPreviewContracts.ts`

## Plano em fases

Cada fase entrega uma tela visivel ponta-a-ponta. Tokens e shell entram
embutidos na primeira tela que os usa. Cadencia: 1 commit por fase, Paulo
valida visualmente antes da proxima.

| # | Tela / entregavel | Status | Commit |
|---|-------------------|--------|--------|
| 0 | Tokens semanticos `--wb-ok/warn/err/info/violet/fire/leitura` | ✅ feito | `3779aec` |
| 1a | Shell parcial (UnifiedSidebar + CommonTopBar **so** Bruto) | ⚠ superseded por Bruto completo | `7b8192b` |
| 1b-2 | **Bruto completo** (shell reescrito + context strip + timeline enxuta + RightTabsPanel + grid 1.6fr 1fr) | ✅ feito | `bfea1e1` + `37337d3` + `7949a20` |
| 3 | **Pos · Cenas + Topbar + Sidebar** (PosTopbarExtra novo + ScenesPostProductionPage refeito + CenasPanel/CenaItem/RendererConfigControls refinados) | ✅ feito | `3001a9b` |
| 4 | **Pos · Layout YouTube** ⭐ (FundoThumb SVG + bloco Padrao reagrupado + escopo projeto + ajustes Cenas) | ✅ feito | `5f35ccc` |
| 4b | **Pos · Layout YouTube — hierarquia compacta + Backend Projeto/Global separados + Modal** | ✅ feito | `3b2320c` |
| 4c | **Pos · Layout — Tipo do projeto separado do preset Padrao** | ✅ feito | `25fc979` + `e30df23` |
| 5 | **Pos · aba Filtros** (refino + select Filtro padrao migrado para a aba) | ✅ feito | `58e6c6c` |
| 6 | **Pos · SceneTimeline** (Panel header com badges + 2 trilhas alinhadas + zoom + inline +Comp/+Full) | ✅ feito | `04c0285` + `1e7b5d9` |
| 6b | **Seletor de paletas** (5 paletas + dropdown no ThemePicker, localStorage) | ✅ feito | `2b6797f` + `f55af6b` |
| 7 | **Final · read-only** (UnifiedSidebar + CommonTopBar + Player + SceneTimeline readOnly + Checklist + Capa) | ✅ feito | (pendente commit) |

## Regras de execucao

1. **Citar fonte do hand-off em cada decisao** — `[hand-off: §x]` ou
   `[decisao: motivo]` (quando hand-off nao cobre).
2. **Granularidade fina antes de executar** — lista numerada por componente.
   Paulo aprova antes de tocar codigo.
3. **Atualizar este doc a cada commit** — status na tabela acima + checklist
   das mudancas reais aplicadas.
4. **Sem auto-mode nesta feature** — Paulo decide cadencia.

---

## Fase 0 — Tokens semanticos · FEITA (`3779aec`)

`frontend/src/index.css` + `frontend/tailwind.config.ts`.

- Adicionou `--wb-ok/-soft`, `--wb-warn/-soft`, `--wb-err/-soft`,
  `--wb-info/-soft`, `--wb-violet/-soft`, `--wb-fire/-soft`, `--wb-leitura/-soft`
  em light e dark. `[hand-off: README §3]`
- Tailwind namespace `wb.*` exposto (classes `bg-wb-ok-soft`, `text-wb-warn`).
- Tokens legados `--success/--warning/--error/--info` mantidos.

---

## Fase 1a — Shell parcial · A REVISAR (`7b8192b`)

Arquivos:
- ➕ `frontend/src/features/editor/UnifiedSidebar.tsx`
- ➕ `frontend/src/features/editor/CommonTopBar.tsx`
- ✏️ `frontend/src/components/layout/AppShell.tsx`
- ✏️ `frontend/src/features/editor/EditorPage.tsx`

### Problemas reportados por Paulo (2026-05-30)

1. **Sidebar com cortes minusculos** — `Biblioteca/Captura` ocupam espaco que
   deveria ser da lista de cortes. Hand-off pede globais [README §5.1], mas
   o prototipo real (Paulo confirmou) os esconde na etapa de edicao. O logo
   pode virar atalho para a pagina principal. `[decisao Paulo: prototipo > README]`
2. **StatusToggles movidos sem justificativa** — eu coloquei a direita (entre
   PhaseTabs e acoes primarias). Hand-off [README §5.2] diz "Esquerda: ... +
   status pills opcionais (✓ Aprovado / 🔥 TOP)". Deveriam ficar a esquerda,
   inline com titulo OU em sub-row abaixo (como no `RealEditorHeader` original).
3. **Botoes nao recolhidos** — Fase 1a so trocou shell. Topbar do Bruto ainda
   tem botoes que o hand-off pede recolher (ex.: "Atualizar pos-producao",
   "Abrir pasta" deveriam estar em menu `moreH`/`⋮`).
4. **Escopo das fases mal mapeado** — Fase 1 nao deveria parar no shell;
   deveria entregar Bruto inteiro para validacao visual ponta-a-ponta.

### Acao corretiva (combina 1b + 2 em "Bruto completo")

Detalhada na proxima secao. So executa apos OK do Paulo.

---

## Fase 1b-2 (proposta) — Bruto completo

### Objetivo

Entregar a tela do Bruto (`/projetos/:id/cortes/:corteId`) ja 100% alinhada
com `01_BRUTO.md`, incluindo correcoes da Fase 1a.

### Bullets de mudanca (cada um precisa OK individual ou em bloco)

#### A. UnifiedSidebar — correcoes [decisao Paulo, sobrescreve README §5.1]
- [ ] **A1** — Remover items globais `Biblioteca` e `Captura` da sidebar dentro
  do editor.
- [ ] **A2** — Logo (Film) vira `<Link>` para `/projetos` (pagina principal /
  biblioteca de projetos).
- [ ] **A3** — Comprimir vertical: nav projeto (`Bruto/Pos/Final`) com altura
  reduzida (38–44px ao inves de 52px) para sobrar mais altura para a lista
  de cortes. `[decisao Paulo: lista cortes precisa mais espaco]`
- [ ] **A4** — Botao "Studio" mantido como esta (destaque ink, link para
  workspace do projeto). `[hand-off: README §5.1]`
- [ ] **A5** — Rodape (tema + ajustes) mantido. `[hand-off: README §5.1]`

#### B. CommonTopBar — correcoes
- [ ] **B1** — Mover `StatusToggleRow` para a ESQUERDA, inline com #N + titulo
  (mesma linha) OU em sub-row abaixo do titulo. `[hand-off: README §5.2 "Esquerda:
  #n + titulo do corte + status pills opcionais"]` Decisao: sub-row porque toggle
  interativo nao cabe em pill mono compact.
- [ ] **B2** — Recolher em menu `moreH` (`⋮` ghost a direita) as acoes raras:
  `Atualizar pos-producao`, `Abrir pasta`, `Atalhos`. `[hand-off: README §5.2
  "Direita: ... + moreH (ghost)"]`
- [ ] **B3** — Manter direita visivel apenas: `secondaryAction (Gerar bruto)`,
  `primaryAction (Salvar)`. `[hand-off: 01_BRUTO.md "Topbar (Bruto)"]`
- [ ] **B4** — Altura header continua **56px** (`min-h-[56px]`). `[hand-off: README §5.2]`
- [ ] **B5** — Restaurar duplo-clique no botao Leitura abrindo modal de
  autor/parte (regressao da fase 1a). `[decisao: preservar funcionalidade
  do RealEditorHeader que o hand-off nao cobre]`

#### C. BrutoContextStrip (NOVO) — substitui ControlsPanel + StatusPills [01_BRUTO.md "BrutoContextStrip"]
- [ ] **C1** — Faixa horizontal abaixo da topbar, `bg --wb-bg`, borda inferior.
- [ ] **C2** — Card "Fim do corte anterior" — chevrons-left + caption mono
  `FIM ANTERIOR #N` + timecode mono.
- [ ] **C3** — Bloco unico In/Out/Dur (3 colunas com divisores) + botao
  `Intervalo` (icone edit) que abre editor manual.
- [ ] **C4** — Quando aberto: card `accent-soft` com 2 inputs mono (de → ate) +
  botao `Aplicar` accent.
- [ ] **C5** — `Liquido (sem trechos)` — caption + timecode `--wb-ok`.
- [ ] **C6** — Card "Inicio do proximo corte" — chevrons-right + caption mono +
  timecode.

#### D. Bruto timeline (`TimelinePanel.tsx`) — toolbar enxuta [01_BRUTO.md "Timeline"]
- [ ] **D1** — Header do Panel: "Timeline" + badge `N trechos`.
- [ ] **D2** — Direita do header (sempre visivel):
  - Transport agrupado: inicio / −5s / play (ink) / +5s / fim
  - `In` / `Out` (outline)
  - divisor
  - `Trecho aqui` (accent, +)
  - `refresh` (atualizar onda)
  - Velocidade como DISPLAY (pill mono `⚡ 1.25×` em --wb-warn, nao interativo)
- [ ] **D3** — Menu `⋮` (moreV) recolhe: Diminuir/Aumentar zoom, Reproduzir
  sem trechos, Modo ponteiro, Destravar trecho, Fixar altura. Rodape do menu:
  `Zoom 1.5× · Velocidade 1.25×`.
- [ ] **D4** — Atalhos `shortcuts.ts` preservados intactos.

#### E. RightTabsPanel (NOVO) — funde TrechosPanel + TranscriptPanel [01_BRUTO.md "Painel direito"]
- [ ] **E1** — Header de abas: grip + aba `Trechos a remover` (scissors,
  badge contagem err quando ativa) + aba `Transcricao` (fileText, badge
  contagem). Default `Trechos`.
- [ ] **E2** — Direita do header: `refresh` SEMPRE visivel (reanalisar
  trechos / atualizar transcricao).
- [ ] **E3** — Aba Trechos: sub-barra filtros `IA / Manual / Silencios` +
  botao `+` (accent, adicionar). Lista com timecode + tag colorida + delta
  `−Xs` + motivo + lixeira (ghost).
- [ ] **E4** — Aba Transcricao: campo busca (⌘F) + linhas timecode + texto.
  Linha ativa: `bg accent-soft` + barra acento esquerda.

#### F. Grid do EditorFase1 [01_BRUTO.md "Layout geral"]
- [ ] **F1** — `grid-template-columns: 1.6fr 1fr`, `grid-template-rows:
  1fr 320px`, `gap: 12px`, `padding: 12px`.
- [ ] **F2** — Coluna esquerda: Player (linha 1) + Timeline (linha 2).
- [ ] **F3** — Coluna direita: RightTabsPanel (`grid-row: 1 / span 2`).

### Cobertura visual

Apos esses 6 grupos, a tela Bruto = 100% do `01_BRUTO.md`. Paulo abre o
editor e valida tudo de uma vez antes da Fase 3 (Pos · Cenas).

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| ✏️ | `frontend/src/features/editor/UnifiedSidebar.tsx` |
| ✏️ | `frontend/src/features/editor/CommonTopBar.tsx` |
| ✏️ | `frontend/src/features/editor/EditorPage.tsx` |
| ✏️ | `frontend/src/features/editor/fase1/EditorFase1.tsx` |
| ✏️ | `frontend/src/features/editor/fase1/TimelinePanel.tsx` |
| ➕ | `frontend/src/features/editor/fase1/BrutoContextStrip.tsx` (novo) |
| ➕ | `frontend/src/features/editor/fase1/RightTabsPanel.tsx` (novo) |
| 🗑️ | `frontend/src/features/editor/fase1/ControlsPanel.tsx` (substituido) |

`TrechosPanel.tsx` e `TranscriptPanel.tsx` viram subcomponentes do
`RightTabsPanel` (lista interna preservada).

### Riscos

- `EditorFase1` reorganiza grid — possivel desalinho temporario em
  resolucoes pequenas (validar 1366×768 e 1920×1080).
- Remocao do `ControlsPanel` — confirmar que nada externo importa.
- Refresh sempre visivel no RightTabsPanel — confirmar que `useSincronizarTranscricao`
  e `useAnalisarDesvios` (existentes) cobrem ambos os modos.

---

## Fases 3+ — Pos e Final

Detalhamento sera escrito ao final da Fase 1b-2 (depois de Paulo validar Bruto
completo). Cada fase tera seu proprio bloco de bullets numerados aqui.

## Historico

| Data | Evento |
|---|---|
| 2026-05-30 | Feature F-024 criada. Hand-off recebido em zip. |
| 2026-05-30 | Fase 0 (tokens) executada — `3779aec`. |
| 2026-05-30 | Fase 1a (shell parcial) executada — `7b8192b`. Reportada com problemas: sidebar comprimida, StatusToggles deslocados sem justificativa, botoes nao recolhidos, escopo mal mapeado. |
| 2026-05-30 | Detectado: arquivos do zip estavam com nomes shiftados. Acesso correto pelo link do hand-off da Anthropic. Plano refeito com base em `v2_shell.jsx` (linha 278-379 UnifiedSidebar, 432-500 CommonTopBar) + `v2_bruto.jsx` (linha 17-203 ContextStrip, 206-402 TimelineV2, 405-624 RightTabsPanel, 627-649 PlayerV2). |
| 2026-05-30 | Decisoes Paulo: (a) remover Biblio/Captura da sidebar — logo vira link para /projetos; (b) StatusToggle compacto (ícone-only) **interativo**, inline com titulo no topbar; (c) entregar Bruto end-to-end num commit. |
| 2026-05-30 | **Bruto completo entregue**. Arquivos reescritos: UnifiedSidebar, CommonTopBar, EditorPage, PlayerPanel, TimelinePanel, EditorFase1. NOVOS: BrutoContextStrip, RightTabsPanel. Substituidos (mortos no disco, removidos do uso): ControlsPanel, TrechosPanel, TranscriptPanel, EditorCutList, EditorNavbar. CommonTopBar agora aceita `moreMenuItems` para dropdown moreH. Tests 98/98 OK, build OK, typecheck/lint OK. |
| 2026-05-30 | **Ajustes pos-revisao Paulo** (commit pendente): (4a) waveform preenche todo o painel via `height:'auto'` do WaveSurfer; (4b/4c) volta `react-resizable-panels` na coluna esquerda — Player (default 65%, cresce) + Timeline (default 35%, min 15%) + handle horizontal entre cols; (5a) refresh do RightTabsPanel SEMPRE atualiza transcricao (independente da aba); (5b) bug fix botao Manual ficava perpetuamente disabled (`usePromptDesvios(corteId, false)` => `isPending` sempre true) — removido o uso, chama agora só `onGerarManual` que abre `TrechosManualModal`. |
| 2026-05-30 | **Ajustes pos-revisao 2 Paulo**: (6a) menu Avancado da Timeline (botao ⋮) cortava itens (Destravar trecho / Fixar altura) porque o overflow do Panel pai escondia. AdvancedMenu agora renderiza via `createPortal` no `document.body` com `position:fixed` calculado pelo bounding rect do botao + fallback `max-height: calc(100vh - 100px)` + `overflow-y-auto`. AdvancedMenu virou auto-contido (state interno + outside-click handler). (6b) `trechoLocked` agora comeca **false** (destravado) por default — usuario pode redimensionar trechos na waveform sem precisar destravar manualmente; useEffect tambem reseta para false ao trocar de corte. |
| 2026-05-30 | **Fase 7 entregue — Final read-only** (commit pendente). FinalReviewPage reescrita conforme v3_final.jsx (read-only end-to-end exceto Metadados+Aprovar). (1) Shell: UnifiedSidebar activePhase='final' + CommonTopBar. (2) CommonTopBar ganhou prop opcional `statusPills` (read-only) usada aqui ao lado do titulo (Aprovado/TOP). secondaryAction=Metadados (FileText outline → abre MetadataModal), primaryAction=Aprovar (tone ok bg-wb-ok, icone Upload; vira CheckCircle 'Aprovado' quando ja aprovado), moreMenuItems=[Re-renderizar, Pasta, Atalhos]. (3) Grid: cols 1.5fr 320px / rows 1fr 220px (hand-off 03_FINAL.md). (4) NOVO FinalPlayerPanel local: Panel 'Vídeo final' + chip info 1920×1080·29.97fps·h264 + MP4 (link download) + Pasta (folder outline) + <video controls>. (5) SceneTimeline reutilizado com readOnly=true (sem zoom, sem +Comp/+Full, blocos com cursor:default — preparado na Fase 6). (6) NOVO ChecklistCard local: Panel + badge OK/Total (ok/warn) + lista de 6 items conectados aos status reais (video_pronto, overlays_prontos, grade_pronta, metadados_completos, thumbnail_pronta, audio inferido pelo video). Items OK: circulo wb-ok ✓; pendentes: bg wb-warn-soft + circulo border wb-warn. (7) NOVO CapaCard local: Panel + badge pronta/pendente + Editar (ghost) → abre MetadataModal. Thumbnail 16/9 com gradiente + titulo serif sobreposto. (8) Helpers FinalTopBar/FinalVideoPanel/FinalSceneTimeline/FinalStatusPill antigos removidos; teste obsoleto FinalReviewPage.test.tsx deletado (testava FinalTopBar inexistente). SettingsModal + MetadataModal + RenderStartModal preservados. Tests 97/97 OK (1 a menos pelo teste removido), build OK. |
| 2026-05-30 | **Fase 6b entregue — Seletor de paletas (5 paletas, localStorage)** (commit pendente). Decisao Paulo (antes da Fase 7 Final): adicionar capacidade de trocar paleta de acento. Implementacao: (1) index.css ganhou overrides `:root.wb-palette-{id}` para `indigo`, `forest`, `plum`, `ink` (terracota = default sem classe), light + dark calibrados a partir de `design_reference/src/v2_paletas.jsx`. (2) NOVO hook `frontend/src/hooks/usePalette.ts` expoe `PALETTES` (5 opcoes com nome/descricao/swatch), `usePalette()` (lê/escreve localStorage 'wb-palette' + aplica classe no <html>), `bootstrapPalette()` (chamado em main.tsx antes do React hidratar — evita flash de cor). (3) ThemePicker refatorado: dois botoes inline — Sun/Moon (toggle light/dark, igual) + chevron pequena que abre dropdown via createPortal com as 5 paletas (swatch circular + nome + descricao + ring de selecao na ativa). Outside-click fecha. Persiste por dispositivo (localStorage, sem backend). Tests 98/98 OK, build OK. |
| 2026-05-30 | **Fase 6 entregue — Pos · SceneTimeline** (commit pendente). SceneTimeline reescrita conforme v3_pos.jsx:177-370: Panel header com Grip + serif/mono 'Timeline · cenas + layout YouTube' + Chip 'N cenas' + Chip info 'N regiões' + zoom -/+ (clamp 1-4x via setState) a direita. Duas trilhas alinhadas (label mono 76px a esquerda): Cenas h-46 com blocos coloridos por tipoMeta, cena ativa (activeIdx) com borda 2px + tint + shadow; Layout YT h-28 com blocos info/violet por modo. +Comp/+Full inline a direita da trilha Layout (144px reservados), com tooltips. Spacer 144px na trilha Cenas para alinhamento. Regua de timecodes (paddingLeft 84) + playhead vertical absoluto entre as duas trilhas. EditorFase2.tsx: novas funcoes `handleSelectCena` (faz seek pra inicio da cena ordenada) e `handleAddRegion` (PATCH direto no corte.layout_youtube via useAtualizarCorte; cache do corte atualizada manualmente para YoutubeLayoutPanel re-renderizar). YoutubeLayoutPanel.tsx: removidos os botoes temporarios +Comp/+Full (migraram para a timeline conforme hand-off Fase 6). addRegion local removido. readOnly preparado para Fase 7 (Final): esconde zoom + esconde +Comp/+Full + blocos com cursor:default. Tests 98/98 OK, build OK. |
| 2026-05-30 | **Fase 5 entregue — Pos · aba Filtros refinada + select migrado para a aba** (commit pendente). FiltroTestePanel reescrito conforme v3_pos.jsx:1619-1830: header com sliders + serif 17/500 'Teste de filtros'; Card 'Padrão do projeto' (accent-soft + selo ✓ + nome ativo) le do projeto.filtro_padrao via useQuery; slider duracao 5-20s com label mono; botoes Preview Ns (secondary) + Todos (outline refresh); lista com NOVO componente FiltroItem usando `role="button"` (NAO <button> — bug button-in-button corrigido conforme 02_POS.md), mini-preview thumbnail 64x36, badges 'padrão' accent + 'preview'/'completo' (warn/ok), icone-botao Download interno (abrir preview). Botao 'Salvar como padrão' (accent) desabilita quando o selecionado JA e padrao (vira 'Já é padrão'). Cache do projeto invalidado após salvar para o card refletir imediatamente. EditorFase2.tsx: removido o select 'Filtro padrao' do header das tabs (migrou inteiramente para a aba Filtros). Removidas tambem variaveis nao-usadas (FALLBACK_FILTERS, filtrosResponse, filtros, filtroPadraoMutation). Mutations e queries preservadas (api.atualizarFiltroPadrao, processarMultiversion, listarFiltros, listarVersoes, obterProjeto). Tests 98/98 OK, build OK. |
| 2026-05-30 | **Fase 4c entregue — Tipo do projeto separado do preset Padrao** (commit pendente). Esclarecimento Paulo: o card Padrao (Usar/Definir Projeto/Global) cuida SOMENTE de fundo+placa+posicionamento (preset compartilhado). O "Tipo do projeto" (Full|Compartilhada que novos cortes herdam) e um conceito SEPARADO. Mudancas: (1) `definirComoPadrao` voltou a forcar `modo_padrao: 'compartilhada'` no preset salvo (preset so faz sentido em Compartilhada). (2) `aplicarPadrao` NAO toca mais o `modo_padrao` do corte ao aplicar preset — preserva o modo. (3) NOVO componente `ProjectTypeToggle` no header: 2 pilulas Full|Compartilhada + caption "novos cortes herdam"; valor lido do `modo_padrao` salvo no projeto, default Full (Paulo). (4) Modal de confirmacao tambem para mudar tipo do projeto. (5) `definirTipoProjeto(modo)` faz PATCH parcial preservando preset existente. (6) "Modo do CORTE" recebeu sub-label "Modo deste corte" (separar visualmente do tipo do projeto). (7) Card Padrao agora aparece SO em modo Compartilhada do corte (decisao Paulo — Padrao nao tem sentido em Full). (8) "Usando padrao" agora compara so preset (fundo/placa/compartilhada), nao modo_padrao. (9) PadraoScopeRow renomeou label de "Salvo: Full" para "Preset salvo"/"Nenhum preset salvo". Tests 98/98 OK, build OK. |
| 2026-05-30 | **Fase 4b entregue — Layout hierarquia compacta + Backend Projeto/Global separados + Modal** (commit pendente). Decisoes Paulo aplicadas: (1) Tipo do projeto editavel (via "Definir como Projeto" no card Padrao apos mudar Modo do corte — sem UI separada). (2) Fundo / Placa / Posicionamento agora COLAPSADOS por default; novo componente `Collapsible` com chevron + summary line. (3) Stats grid 3 subiu para o header (acima do Modo do corte). (4) Card Padrao moveu-se para baixo do Modo do corte (entre header e secoes), sempre visivel com caption "Usando padrao Projeto|Global|Customizado", expandivel em 2 sub-grupos (Projeto/Global) com 2 botoes cada (Usar/Definir). (5) **Modal de confirmacao do app** (`Modal` ui) para cada uma das 4 acoes. (6) **Backend separa Projeto de Global**: adicionado `AppSettings.youtube_layout_padrao_global` (JSON string, default "{}") em `app/services/app_settings.py` + endpoint PUT /settings aceita o campo + projetos.py PATCH render-config com `global_update=True` agora persiste ADICIONALMENTE no AppSettings global (mantem F-020 replica em todos os projetos para compat). Frontend types AppSettings + api.atualizarSettings (aceita objeto agora) + YoutubeLayoutPanel le ambos os escopos via useQuery e mostra "Usando" comparando JSON. `usarPadraoProjeto` e `usarPadraoGlobal` agora leem de fontes separadas. Backend tests 813/813 passam; frontend 98/98, build OK. |
| 2026-05-30 | **Fase 4 entregue — Pos · Layout YouTube + ajustes Cenas** (commit pendente). Layout: (1) NOVO `FundoThumb` em youtubeBackgrounds.tsx — SVG line-art line-art replicando v3_pos.jsx:1144-1169 (substitui letra G/H/I/B/D/F). (2) `YoutubeLayoutPanel.tsx` reescrito: header com Layers+serif 17/500+Chip info+Salvar (so dirty); caption "Tipo do projeto" lendo `projeto.layout_youtube_padrao.modo_padrao` (Paulo); ModePicker Full/Compartilhada (override pontual); Stats 3-col; em Full mostra card tracejado info; em Compartilhada: LayoutSubLabel Fundo + grid 3 FundoPicker com SVG + descricao, LayoutSubLabel Placa + grid 2 PlacaField, Posicionamento (serif 14/500 + caption mono + link Preset rotate ghost) + grid 2 ModePicker rects + SharedRectEditor preservado + CropPicker preservado, PadraoLayoutGroup card accent com Usar padrao wide + Salvar como Projeto/Global. Regioes customizadas com dica "+na timeline" + botoes temporarios +Comp/+Full ate Fase 6. `definirComoPadrao` deixou de forcar 'compartilhada' (decisao Paulo); `usarPadrao` aplica o `modo_padrao` salvo (nao forca). +Comp/+Full removidos do header (migram para timeline na Fase 6). `Preset` virou link em Posicionamento. Padrao Projeto/Global/Usar saiu do header e foi reagrupado em card no fim. (3) Ajustes Cenas: CenaItem click no card chama onSeek (chevron alterna expander); botao Remover ghost visivel no card colapsado; removido botao Remover redundante do body expandido (so Aplicar+Ir). (4) RendererConfigControls.Avancado removeu placeholder Render V2 (so Sombra resta — V1 nao existe mais). Sombra default `nenhuma` confirmado. Tests 98/98, build OK, typecheck/lint sem erros. |
| 2026-05-30 | **Fase 3 entregue — Pos · Cenas + Topbar + Sidebar** (commit pendente). Arquivos: (A) `ScenesPostProductionPage.tsx` trocou RealEditorHeader+EditorCutList por CommonTopBar+UnifiedSidebar (igual Bruto); slot `extra` recebe PosTopbarExtra; primaryAction=Renderizar; moreMenuItems=[Pasta, Atalhos]; SettingsModal+MetadataModal injetados. (B) NOVO `PosTopbarExtra.tsx` (replica v3_pos.jsx:22-144) com VideoTypeMarker (TOP/LEITURA pill read-only) + PosStepperBar (4 passos clicaveis, conector accent ate passo atual). Click no passo 1 abre MetadataModal. (C) `EditorFase2.tsx` tabs refinadas (bg-inset, aba ativa=bg-card+shadow). Select "Filtro padrao" preservado por hora — sera movido p/ aba Filtros na Fase 5. (D) `CenasPanel.tsx` header reorganizado por frequencia: titulo serif + chip contagem + chip warn fichas sem retrato + caption; acao primaria Manual(IA)/Retratos/moreH; Padroes do projeto com Card visivel + expander avancado (Render+Sombra). Footer Marcar validadas (ok). (E) `RendererConfigControls.tsx` split em `RendererConfigControls.Card` e `RendererConfigControls.Avancado` (Render placeholder + Sombra); default export mantido p/ compat. (F) `CenaItem.tsx` reescrito como CenaListItem expansivel (replica v3_pos.jsx:709-867) — fechado: icone 32px + nome + timecodes mono + chip tipo + chevron + alerta sem retrato; aberto: grid 4 (Inicio/Fim/Tipo/Texto) + grid 2 (Subtexto/Contexto) + comparativo? RotuloA/B + ficha? Nome curto + caption Visual + grid 3 ConfigSelect (Sombra/Layout/Modelo com Auto) + retrato block se ficha + acoes Ir/Remover/Aplicar. **Todas as mutations preservadas** (gerarIa, atualizarCorte, preencherRetratos, validarCenas, atualizarRenderConfig, fontePresetMutation, filtroPadraoMutation). Tests 98/98 OK, build OK, typecheck/lint sem erros. |

---

## Fase Bruto-completo (em execucao) — fontes de verdade

Os bullets abaixo replicam o design fielmente. Cada item cita `arquivo.jsx:linha`.

### A · UnifiedSidebar — reescrever conforme `v2_shell.jsx:278-379`
- A1 — Largura 132px [v2_shell.jsx:282]
- A2 — Logo Film (40x40, --wb-ink) como `<Link to="/projetos">` [v2_shell.jsx:292-307 + decisao Paulo]
- A3 — Studio (highlight, 60x52) [v2_shell.jsx:312-317]
- A4 — Divisor 32x1 [v2_shell.jsx:318]
- A5 — REMOVER Biblio + Captura [decisao Paulo, sobrescreve v2_shell.jsx:319-320]
- A6 — Bruto/Pos/Final (60x52, ativo=accent-soft+barra 3px) [v2_shell.jsx:322-324]
- A7 — Header "CORTES · N" com borderTop [v2_shell.jsx:328-344]
- A8 — Lista cortes scroll (CorteCard preserva CorteStatusCard existente, NAO inventa) [v2_shell.jsx:346-360, 01_BRUTO.md "Sidebar"]
- A9 — Rodape: tema + ajustes (IconBtn ghost 32px) [v2_shell.jsx:362-376]

### B · CommonTopBar — reescrever conforme `v2_shell.jsx:432-500`
- B1 — Altura 56px, padding 0 20px, bg-panel, borderBottom soft [v2_shell.jsx:438-444]
- B2 — Esquerda: `#N` mono 12 faint + titulo serif 19 medium ink (truncado) + statusToggles + dirty [v2_shell.jsx:446-483]
- B3 — Centro: extra slot || PhaseTabs (segmented, ink ativo) [v2_shell.jsx:485, 384-428]
- B4 — Divisor 1x22 + secondaryAction + primaryAction + (showMetaIcon?) + moreH ghost [v2_shell.jsx:487-497]

### B2 · StatusToggleCompact (NOVO) — interativo, decisao Paulo
- B2.1 — Pill compact 22-24px com SO icone (sem label)
- B2.2 — Ativo: bg cor + ring; Inativo: outline + hover
- B2.3 — Cores: ok (var(--wb-ok)), fire, leitura, err. 4 botoes inline a esquerda do titulo.

### C · BrutoContextStrip (NOVO) — replicar `v2_bruto.jsx:17-203`
- C1 — Faixa horizontal, padding 10px 16px, bg --wb-bg, borderBottom soft [v2_bruto.jsx:19-28]
- C2 — Card "Fim anterior #N" — chevronsLeft + caption mono + timecode mono [v2_bruto.jsx:31-51]
- C3 — Bloco In/Out/Dur (3 cells com divisores) + botao Intervalo [v2_bruto.jsx:53-110]
- C4 — Intervalo editavel (2 inputs mono + Aplicar accent) — toggle [v2_bruto.jsx:113-165]
- C5 — Spacer + Liquido (caption + timecode --wb-ok) [v2_bruto.jsx:167-177]
- C6 — Card "Inicio prox #N" — caption + timecode + chevronsRight [v2_bruto.jsx:179-200]

### D · BrutoTimelineV2 (refinar `TimelinePanel.tsx`) — `v2_bruto.jsx:206-402`
- D1 — Panel header "Timeline" + badge "N trechos" [v2_bruto.jsx:209-212]
- D2 — Toolbar enxuta (direita):
  - Transport agrupado (chevronsLeft/chevronLeft/play ink/chevronRight/chevronsRight) em bloco --wb-bg-inset [v2_bruto.jsx:216-222]
  - Btn In/Out outline (icons flag/flagR) [v2_bruto.jsx:224-229]
  - divisor [v2_bruto.jsx:230]
  - Btn "Trecho aqui" accent (plus) [v2_bruto.jsx:231-233]
  - IconBtn refresh [v2_bruto.jsx:234]
  - Display velocidade (pill mono warn, NAO botao) [v2_bruto.jsx:236-255]
- D3 — Menu ⋮ (moreV) recolhe: zoom -/+, scissors smartplay, pointer, unlock lock, pin [v2_bruto.jsx:257-326]
- D4 — Corpo waveform com regiao principal + desvios + regua timecodes [v2_bruto.jsx:331-399]
- D5 — Atalhos `shortcuts.ts` preservados intactos

### E · RightTabsPanel (NOVO) — replicar `v2_bruto.jsx:405-624`
- E1 — Panel headStyle:none, container flex-col [v2_bruto.jsx:407-413]
- E2 — Header de abas: grip + 2 abas (Trechos default + Transcricao) com badge contagem + refresh sempre [v2_bruto.jsx:416-476]
- E3 — Aba Trechos:
  - Sub-barra: IA(ink), Manual(outline), Silencios(outline) + IconBtn plus accent
  - Lista: timecode col + Chip tone + delta -Xs + motivo + IconBtn trash ghost [v2_bruto.jsx:484-548]
- E4 — Aba Transcricao:
  - Busca (Buscar palavra…, ⌘F)
  - Linhas: timecode mono + texto; ativa=accent-soft+barra accent [v2_bruto.jsx:550-624]

### F · PlayerPanel (refinar `PlayerPanel.tsx`) — `v2_bruto.jsx:627-649`
- F1 — Panel header "Player" + badge `vídeo original · 4K` (info)
- F2 — Right: mono "1.25× · 00:00:24.6"
- F3 — REMOVER painel inferior de prev/next (foi pro BrutoContextStrip)
- F4 — Manter <video> existente e useVideoPlayer hook

### G · EditorFase1 (reescrever grid)
- G1 — Remover PanelGroup/react-resizable-panels [decisao: 01_BRUTO.md grid fixo]
- G2 — Grid: cols 1.6fr 1fr, rows 1fr 320px, gap 12, padding 12 [01_BRUTO.md "Layout geral"]
- G3 — Player col 1 row 1
- G4 — Timeline col 1 row 2
- G5 — RightTabsPanel col 2 row 1/span 2

### H · EditorPage
- H1 — Adicionar BrutoContextStrip entre CommonTopBar e EditorFase1
- H2 — Remover StatusToggleRow (vai pro StatusToggleCompact dentro do CommonTopBar)
- H3 — Topbar trailing: SO moreH ghost (recolhe Atualizar/Pasta/Atalhos) [v2_shell.jsx:497]
