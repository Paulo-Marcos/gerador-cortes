# Auditoria da implementação × design Workbench (18/07/2026)

Comparação do `frontend/` atual com o protótipo `Workbench 1c.dc.html`.
Formato: **OK** (já no padrão) · **ADAPTAR** (parcial) · **REFAZER** (layout antigo).

---

## §1 Shell — OK (com ressalvas)

`WorkbenchShell`, `TabStrip`, `ProjectRail`, `GlobalQueue`, providers e flag `VITE_WORKBENCH` existem e seguem o DE-PARA §0. Ressalvas:

1. **ProjectRail — ADAPTAR.** O card do rail usa `PipelineProgress compact` (círculos 10px). O design agora usa **ícones de etapa 21px** no lugar dos tracinhos: ⬇ ingestão · 🧠 análise · ✂ bruto · 🎬 pós · 🏷 metadados · 🚀 publicação. Estados: feito = `--wb-ok-soft`/`--wb-ok-ink`; ativo = cor cheia + `box-shadow: 0 0 6px` da cor; pendente = `--wb-bg-inset` + `opacity:.55`. Cada ícone com `title` descritivo.
2. **Nav global do rail — ADAPTAR.** Ícones dos itens (Biblioteca, Ranking…) devem ter **17px** em caixa de 22px (`w-[22px] text-[17px]`), não 16px/w-5. Manter lucide equivalentes se preferir (Home, Trophy, RadioTower, Sparkles, BarChart3, Keyboard, Settings) no MESMO tamanho.
3. `pipeline.tsx` (`Pipeline compact`) — subir ícones: compact 21px círculo / ícone 12px; normal 26px / 14px. Nunca 10px.

## §2 Telas com layout ANTIGO — REFAZER (prioridade máxima)

`EditorPage` (Bruto), `ScenesPostProductionPage` (Pós) e `FinalReviewPage` (Revisão) ainda renderizam:

- `UnifiedSidebar` + `ml-[132px]` → **dentro do WorkbenchShell isso duplica navegação e desperdiça 132px**. Remover ambos quando a flag workbench estiver ativa.
- `CommonTopBar` (réplica do v2_shell antigo) → substituir pela estrutura do protótipo (a navegação entre fases vive na TabStrip do shell, não numa topbar própria).

Estrutura alvo (protótipo, aba Cortes/Pós/Revisão):

### 2a. Bruto (`/projetos/:id/cortes/:corteId`)
- Envolver em `WorkbenchEditorLayout` (já existe, Etapa 3) com `panelIds: ['cuts','right']`.
- Painel esq. retrátil **CORTES · n/m** (lista com thumb 50×29, tint semântico ok/err/fire, "＋ adicionar corte"); colapsado vira faixa vertical 40px com rótulo em `writing-mode:vertical-rl`.
- Centro: player 16:9 com cap `min(100%, calc((100vh - 330px)*1.7778))` (`PlayerCap` já existe) → linha de transporte (A · Aprovar / R · Rejeitar / 🔥 Fire / 📖 Leitura + hint `J K L · ←→ 3s · ⌘Z`) → **faixa de contexto** (TÍTULO / INÍCIO / FIM / LÍQUIDA / TRECHOS + 💾 Salvar + ⟳ regerar bruto) → **timeline retrátil** em `flex:1` com header (tempo, trecho travado, zoom, chevron expande 96↔150px+).
- Painel dir. retrátil com tabs **Trechos | Transcrição** (filtros todos/IA/manual/silêncios, botão ✦ IA).

### 2b. Pós (`/projetos/:id/post-production`)
- Barra de steps no topo do conteúdo: `1 Bruto ✓ → 2 Cenas → 3 Grade → 4 Final` + chip de render ativo (`spinner · c07 · 74% · ~4 min`) + botão ▶ Renderizar.
- `WorkbenchEditorLayout` com `panelIds: ['cenas','layout']`: painel CENAS (lista com tipo 🎥/🖥/🔍, faixa de tempo, ⚠ validar) · centro preview Remotion 16:9 + timeline de cenas em blocos proporcionais · painel LAYOUT YOUTUBE (presets, posição da facecam arrastável, sliders escala/zoom, etapas do render, "renderizar em 2º plano →").

### 2c. Revisão (`/projetos/:id/final-review`)
- Layout simples do protótipo: player final 16:9 (cap `100vh - 220px`) + linha de ações (✓ Aprovar e publicar / ↩ Voltar para pós) + meta de agendamento. Sem sidebar própria.

## §3 Tokens antigos — ADAPTAR (varredura mecânica)

Trocar `accent-500/600`, `surface-1/2`, `text-100/200/300`, `bg-800/900/950`, `--accent-glow` pelos tokens `--wb-*` nos arquivos:

- `components/ui/`: card, input, modal (+ claude-button se usar accent antigo)
- `components/PromptManualPanel.tsx`
- `features/channels/`: EditorialScaffoldForm, EditorialSkillForm, PromptUtilitarioForm
- `features/editor/`: EditorNavbar (morre com §2), ShortcutsHelpModal, AdicionarCorteModal, CorteStatusCard, fase2/EditorFase2 (resize handle)
- `features/projeto-detalhe/`: CorteCard, StatusPills, AnaliseIaModal, AuditoriaAnaliseModal, DiarizacaoPanel, ProjetoDetalhePage
- `features/projetos/`: EmptyState, ReadyForYoutubeBadge, ProjetoCardSkeleton
- `features/post-production/PostProductionPage.tsx` (parcial)
- `pages/StubPage.tsx`

Regra: nenhum componente novo pode referenciar a escala antiga; ela só sobrevive no LegacyShell até a Etapa 8.

## §4 Mudanças NOVAS do design (validação de 18/07)

1. **Biblioteca (`ProjetoCard` / `PipelineProgress`)** — substituir a mini-pipeline por **linha de ícones de etapa 24px** (mesmo vocabulário do §1.1). Thumbnail real do YouTube continua como capa.
2. **Workspace do projeto (`ProjetoDetalhePage` / `CorteCard`)** — cada corte vira card com **capa (thumbnail do corte, fallback gradiente)**, badge `#numero` (topo-esq), badge de status (base-esq: aprovado/avaliando…/rejeitado/🔥/pendente), duração (base-dir) e **linha de ícones do processo DO CORTE (23px)**: ✂ Bruto · 🎬 Pós · 👁 Revisão · 🏷 Metadados · 🚀 Publicação, com os mesmos 3 estados do §1.1 e label auxiliar à direita (`74% ⚙`, `continuar ▶`, `sem metadados`). Rejeitado: card `opacity:.72` + véu escuro na capa. Ver protótipo, seção "WORKSPACE DO PROJETO".
3. **Rail** — ícones no lugar dos tracinhos (§1.1) e ícones de navegação maiores (§1.2).

## §5 Checklist de execução sugerido

1. [ ] §2a Bruto sem UnifiedSidebar/CommonTopBar no shell novo (flag ativa)
2. [ ] §2b Pós idem + barra de steps + painel Layout
3. [ ] §2c Revisão layout simples
4. [ ] §4.2 CorteCard novo (capa + ícones de etapa)
5. [ ] §4.1 ProjetoCard/PipelineProgress com ícones
6. [ ] §1 Rail: ícones de etapa + nav 17px
7. [ ] §3 varredura de tokens antigos
8. [ ] Regressão: atalhos wb.* seguem funcionando; auto-colapso ≥420px de centro; temas claro/escuro + 4 acentos

Regras de sempre: nada fora deste documento e do protótipo; sem inventar telas; `--wb-*` para toda cor; painéis retráteis sempre com estado colapsado em faixa vertical de 40px.
