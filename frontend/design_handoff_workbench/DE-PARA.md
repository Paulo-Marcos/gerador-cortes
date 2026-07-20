# DE/PARA — página por página, função por função

Legenda: **[REUSAR]** componente atual entra como está (só re-hospedar/re-estilizar tokens) · **[ADAPTAR]** muda layout, mantém lógica · **[NOVO]** não existe hoje · **[REMOVER]** deixa de existir como UI própria.

---

## 0. Shell global

| Hoje (`src/`) | Novo (Workbench) | Ação |
|---|---|---|
| `components/layout/AppShell.tsx` + `Sidebar.tsx` (rail fixo 64px de ícones) | **Tab strip** no topo + **rail de projetos** à esquerda + **fila global** à direita | [ADAPTAR] |
| `Sidebar` itens globais (Biblioteca, Ranking, Buscar, Padrões, Análises, Canais) | Rodapé do rail: 🏠 Biblioteca, 🏆 Ranking, 📡 Buscar, ✨ Padrões, 📊 Análises, ⌨ Atalhos, ⚙ Configurações | [ADAPTAR] |
| `Sidebar` itens de projeto (Workspace, Editor, Metadados, Pós, Revisão) | Viram **abas de trabalho** `"{numero} · {etapa}"` na tab strip | [ADAPTAR] |
| `components/layout/ThemePicker.tsx` (sol/lua + 5 paletas) | Botão 🌙/☀️ na tab strip + seção Aparência em Configurações → Aplicação | [REUSAR] hooks `useTheme`/`usePalette` |
| `components/layout/SettingsModal.tsx` | Vira página Configurações → Aplicação (modal deixa de existir) | [REMOVER] shell do modal, [REUSAR] `AppSettingsControls` |
| — | **Tab strip**: abas com dot de status colorido (cor da etapa), progresso (`12/18`, `74%`, `1 pronto`), fechar (✕), ＋ nova aba, ⌘K | [NOVO] `workbench/TabStrip.tsx` |
| — | **Estado das abas**: lista de pares `{projetoId, etapa, corteId?}` persistida (localStorage `workbench-tabs-v1`); restaurar no load | [NOVO] `workbench/useWorkbenchTabs.ts` |
| — | **Rail de projetos**: card por projeto ativo (thumb 40×24, título, mini-pipeline de 6 barras coloridas por etapa; etapa ativa com glow) | [NOVO] `workbench/ProjectRail.tsx` — dados de `useProjetos()` |
| — | **Fila global**: jobs de render de TODOS os projetos (progresso %, ETA, "abrir na aba X"); dropzone "renderizar em 2º plano" | [NOVO] `workbench/GlobalQueue.tsx` — fonte: `useExportStatus`/`usePipelineStatus` por projeto com corte em render (poll) |
| — | **PanelShell** genérico: painel retrátil (aberto/colapsado c/ barra vertical), auto-colapso responsivo, persistência | [NOVO] `workbench/PanelShell.tsx` + `useWorkbenchPanels.ts` |
| `routes.tsx` | Rotas mantidas 1:1 (deep-link continua funcionando); a rota ativa abre/foca a aba correspondente | [ADAPTAR] |

## 1. Biblioteca (`features/projetos/ProjetosPage.tsx`)

| Função hoje | Novo | Ação |
|---|---|---|
| Filtros `FILTERS` (todos/não publicados/em análise/editando/publicados) c/ contagens | Chips no header, mesma lógica `matches` | [REUSAR] |
| Busca `query` (título+canal) | Campo 🔍 no header | [REUSAR] |
| `useReiniciarFalhados` + `temFalhados` | Chip "⟳ reiniciar falhados" (warn), visível só se `temFalhados` | [REUSAR] |
| `NovoProjetoForm` (modal) | Botão "＋ Novo projeto" abre o mesmo form | [REUSAR] |
| `ProjetoCard` (thumb, `StatusChip`, `PipelineProgress`, 🏆 pontuação, duração, limpar/remover) | Card novo: thumb 16:9 topo, chip de status sobre a thumb (sup. esq.), 🏆 score (sup. dir.), duração (inf. dir.), título, meta (canal · data · N cortes · N publicados), **pipeline de 6 barras** no rodapé. Ações limpar/remover em hover/menu ⋯ | [ADAPTAR] |
| `estaProntoPraYoutube` → borda accent | Borda `--wb-ok` + chip "pronto p/ YouTube" | [ADAPTAR] |
| `ProjetoCardSkeleton`, `EmptyState`, ordenação `sortProjetosPorPublicacao` | Iguais | [REUSAR] |
| Click no card → `/projetos/:id` | Click → abre/foca aba do projeto (Workspace) | [ADAPTAR] |

## 2. Workspace do projeto (`features/projeto-detalhe/ProjetoDetalhePage.tsx`)

| Função hoje | Novo | Ação |
|---|---|---|
| Header do projeto (título, canal, data, duração, pontuação) | Header com thumb 120px + chips de estado do pipeline (✓ baixado, ✓ transcrito, ✓ diarizado · N falantes, ✂ X/Y avaliados) | [ADAPTAR] |
| `AnaliseIaModal` / `AuditoriaAnaliseModal` | Botão "✦ Analisar com IA" (mesmos modais) | [REUSAR] |
| `PublicarMassaModal` | Botão "▶ Publicar em massa" | [REUSAR] |
| `useAbrirPasta` | Botão "📁 Abrir pasta" | [REUSAR] |
| `VotoQualidadeLive` | Chip "👍 boa live 👎" no header | [REUSAR] |
| `DiarizacaoPanel` | Acessível pelo chip "diarizado · N falantes" (popover/aba) | [REUSAR] |
| `CorteCard` + `StatusPills` | Grid de cards compactos com **cor de fundo semântica** (ok-soft/err-soft/fire-soft/acc-soft) + borda esquerda 3px; click → abre aba "N · Cortes" já no corte | [ADAPTAR] |
| `ReadyForYoutubeBadge` | Mantido no card | [REUSAR] |

## 3. Editor de cortes / Bruto (`features/editor/*`, fase1)

| Função hoje | Novo | Ação |
|---|---|---|
| `EditorPage` (881 linhas: orquestra queries, atalhos, histórico, dirty state) | Mesma orquestração, re-hospedada no conteúdo da aba | [REUSAR] lógica integral |
| `UnifiedSidebar` (nav + lista de cortes + `CorteStatusCard` com tints) | **Painel esquerdo retrátil "CORTES · X/Y"** (236/40px). Tints `tintarFundo` mantidos. Nav sai (foi p/ shell). "＋ adicionar corte" no rodapé da lista → `AdicionarCorteModal` | [ADAPTAR] |
| `CommonTopBar` + `StatusToggleRow` + `BrutoStepsDropdown` + `BrutoContextStrip` | Substituídos por: (a) linha de transporte sob o player — `A · Aprovar` (ok), `R · Rejeitar` (err), `🔥 Fire`, `📖 Leitura`, hint de atalhos; (b) **faixa de contexto do corte**: TÍTULO (editável), INÍCIO/FIM (hms editável), LÍQUIDA (`calcularDuracaoLiquida`), TRECHOS (n desvios), 💾 Salvar, ⟳ regerar bruto (`regerarBrutoPlan`) | [ADAPTAR] |
| `EditorFase1` (react-resizable-panels 62/38, persist `editor-fase1-panels-v2`) | Mantém resize handles internos; larguras/persistência migram p/ `useWorkbenchPanels` | [ADAPTAR] |
| `PlayerPanel` (vídeo, desvios, smartPlay, lip-sync `AudioSyncControl`, `useLipSyncPreview`) | **[REUSAR]** integral; container novo: 16:9 com cap de altura (ver README). Badges BRUTO e velocidade sobrepostos |
| `TimelinePanel` (WaveSurfer, peaks, seek, zoom, lock, pointer, smartPlay, início/fim aqui, ＋trecho, dividir, regerar) | **[REUSAR]** integral; container `flex:1` (cresce com a sobra vertical); linha de ferramentas expansível (toggle ▲/▼, persistido) | [ADAPTAR] container |
| — | ⚠ **CRÍTICO — precisão da waveform**: a timeline é a ferramenta principal para determinar trechos de corte. Requisitos NÃO negociáveis: (1) manter WaveSurfer com `waveformPeaksSrc` (peaks pré-computados) e `height:'auto'` preenchendo TODO o painel — quanto mais alto o painel, mais legível a onda: o container `flex:1` existe para isso; (2) `audioOffsetSec` (`resolveWaveformWindow` de `editorEditState.ts`) aplicado sem drift — cursor da onda e `currentTime` do vídeo sempre sincronizados (tolerância < 1 frame); (3) zoom mantém resolução (re-render de peaks por janela, nunca esticar bitmap); (4) marcadores IN/OUT, desvios e playhead posicionados por tempo real (px = f(seg × zoom)), nunca por %; (5) NUNCA substituir a onda por representação decorativa (a onda fake do protótipo é placeholder de layout, não de comportamento); (6) qualquer regressão de precisão/sincronia da onda reprova a etapa | [REUSAR] + critério de aceite |
| `RightTabsPanel` (Trechos+Transcrição, filtros IA/manual/silêncios, busca, diarização D-360, `ThumbnailHintsEditor`, refresh) | **Painel direito retrátil** (300/38px), mesmas 2 abas e funções | [ADAPTAR] container |
| `TrechosManualModal`, `AdicionarCorteModal`, `ShortcutsHelpModal` | Modais mantidos (ShortcutsHelp vira página, ver §9) | [REUSAR] |
| `useEditHistory` (⌘Z), `shortcuts.ts`, `editorEditState.ts`, `timeUtils.ts` | Intocados | [REUSAR] |

## 4. Pós-produção (`ScenesPostProductionPage` + `fase2/*`)

| Função hoje | Novo | Ação |
|---|---|---|
| `PosTopbarExtra` (steps 1 Bruto → 2 Cenas → 3 Grade → 4 Final; `VideoTipo`) | Barra de steps no topo do conteúdo da aba: chips `1 Bruto ✓ → 2 Cenas (ativo) → 3 Grade → 4 Final` + status de render à direita (spinner, %, ETA) + botão "▶ Renderizar" (`RenderStepsModal`) | [ADAPTAR] |
| `CenasPanel` + `CenaItem` + `SceneTypeIcon` + `CenasManualModal` + `useSegmentosDetectados`/`SegmentoDetectadoPopover` | **Painel esquerdo retrátil "CENAS · N"** (232/40px); cards com tipo, faixa hms, aviso ⚠ validação (`sceneValidation`) | [ADAPTAR] container |
| `CenaPlayerPanel` / `CenasRemotionPreview` (toggle Ctrl+Alt+R) | Centro, 16:9 com cap de altura; PIP da facecam visível | [REUSAR] |
| `SceneTimeline` | Timeline de cenas em blocos coloridos por tipo, `flex:1` vertical | [ADAPTAR] container |
| `YoutubeLayoutPanel` + `posicionamentoControls` + `PosicionamentoModal` + `useLayoutPresets` + `DefinirSplitButton` | **Painel direito retrátil "LAYOUT YOUTUBE"** (260/38px): presets, mini-preview 16:9 com facecam arrastável, sliders escala/zoom, checklist das etapas de render (`renderEtapas`), "renderizar em 2º plano" (manda p/ fila global) | [ADAPTAR] |
| `RendererConfigControls`, `FiltroTestePanel` | Dentro do painel direito (seção colapsável) | [REUSAR] |
| `PostProductionPage` (rota `/export`) | Mantida como step 4 dentro da mesma aba | [ADAPTAR] |

## 5. Revisão final (`final-review/FinalReviewPage.tsx`)

Player final 16:9 com cap + ações: "✓ Aprovar e publicar" (ok), "↩ Voltar para pós", info canal/agendamento. [ADAPTAR] layout, [REUSAR] lógica.

## 6. Metadados (`features/metadata/*`)

| Função hoje | Novo | Ação |
|---|---|---|
| `MetadataPage` + `MetadataCard` | Aba "N · Metadados": lista esquerda de cortes aprovados com status por item (✓ completo / ⚠ pendências); centro com card de títulos (variantes com **score**, copiar 📋, ✦ regerar), descrição+tags | [ADAPTAR] |
| `ThumbnailAvaliacaoPanel` + `thumbnailAvaliacao.ts` | Card Thumbnail: preview 16:9, nota + critérios, ✓ Aprovar / ↻ Refazer | [REUSAR] |
| `ThumbnailHintsEditor` (F-058) | Campo "Hints" no card da thumb | [REUSAR] |
| `MetadataModal` | Continua para acesso rápido a partir do editor/pós | [REUSAR] |
| — | Rodapé "PRONTO P/ YOUTUBE X de Y" + barra + "▶ Publicar em massa" (`PublicarMassaModal`) | [NOVO] composição |

## 7. Buscar lives / Ranking (`features/lives/*`)

- `LiveSearchPage`: busca por @canal/URL; resultados com thumb, meta, chip "nova ✦"/"já ranqueada", ação "＋ adicionar à análise". [ADAPTAR] layout em linhas.
- `RankingLivesPage`: linhas com posição, thumb, título/meta, **barra de score**, chip "embasamento" (`RankingEmbasamentoPanel` popover), "＋ criar projeto" (desabilitada se já tem projeto). Header: "⚖ Pesos do ranking" → Configurações. Linhas com `flex-wrap` (título `min-width:170px`). [ADAPTAR]

## 8. Padrões de thumbnail (`thumbnail-padroes/*`)

Grid de cards: exemplo visual 16:9, nome, **CTR%** (ok≥6, warn<6), nº de usos, descrição da regra. "＋ Novo padrão". [ADAPTAR] layout, [REUSAR] `thumbnailPadroes.ts`.

## 9. Análises (`features/analises/*`)

- Sub-abas: **Proposta × Final** (`PropostaFinalTab`), **Desempenho YouTube** (`YoutubeDesempenhoTab`), **Chamadas LLM** (`LlmCallsTab`) — [REUSAR] as 3, re-hospedadas.
- [NOVO] composição: 4 stat-cards no topo (publicados 30d, CTR médio, aderência proposta→final, custo LLM) + gráfico de barras duplas proposta×final por corte (dados de `useAnalises`/`useLlmCalls`).

## 10. Configurações (unificado) (`features/channels/*` + `features/settings/*`)

Uma página, 2 sub-abas:

**Canal ativo** (ex-`ChannelsPage`): card do canal conectado (`ChannelCard`/`ChannelForm`), 4 cards-portal → subpáginas master-detail:
- **Skills editoriais** (`EditorialSkills*`): lista (etapa, badge Customizado/Padrão, chips modelo/thinking/lentes) + editor (corpo do prompt, lentes 1/linha, params modelo/thinking/timeout, reset por campo `CampoReset`, histórico de versões D-312 com reverter).
- **Scaffolds** (`EditorialScaffold*`): aviso de contrato, chips de placeholders com validação visual (✓ presente / ⚠ ausente — lógica `placeholderPresente`), marcador, texto do invólucro.
- **Prompts utilitários** (`PromptsUtilitarios*`): lista 6 prompts + editor com placeholders validados. [NOVO] opcional: "teste rápido" (roda no corte selecionado sem salvar).
- **Pesos do ranking** (`RankingPesos*`): sliders inline no card.
- `ChannelThemeSection` → dentro do card do canal.

**Aplicação** (ex-`SettingsModal`/`AppSettingsControls` D-191): Aparência (tema+paleta — [NOVO] seção), Nome do mascote (D-285), Logs (3 níveis), Filtro global padrão, Render (cooldown, overlay_concurrency, codec, max_attempts, grade_quality, bundle_cache), Layout YouTube padrão global. Tudo [REUSAR].

## 11. Atalhos (nova página)

`ShortcutsHelpModal` → página estilo VS Code: busca, filtro por tela, tabela Comando · Atalho (kbds) · Tela. Fonte única: `shortcutsRegistry.ts` (I-029) — renderizar do registro, NUNCA hardcodar a lista. [ADAPTAR]

## 12. O que NÃO muda (não tocar)

`hooks/*` (useEditor, useProjetos, useProjetoDetalhe, useDiarizacao, useVideoPlayer, useWarmupWaveforms, useLipSyncPreview, useAutoCopyPrompt…), `lib/*` (todas as APIs), `types/*`, toda a lógica de `editorEditState`, `regerarBrutoPlan`, `postProductionNavigation`, `renderEtapas`, `sceneValidation`, testes existentes. `PromptManualPanel` e `useAutoCopyPrompt` mantidos onde são usados hoje.
