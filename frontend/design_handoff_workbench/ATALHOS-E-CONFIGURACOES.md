# Atalhos e Configurações — estilo VS Code, altamente customizável

## Princípios

1. **Registro central único**: TODO atalho vive em `shortcutsRegistry.ts` (I-029). A página Atalhos, os tooltips e os hints ("J K L · ←→ 3s") renderizam DO registro. Nunca duplicar strings de teclas.
2. **Tudo customizável, tudo com padrão são**: cada preferência tem default; reset individual e "resetar tudo".
3. **Persistência em camadas** (como VS Code user/workspace): `app_settings` (settings.db, backend) para o que afeta processamento; `localStorage` para preferências de UI por máquina.

## 1. Atalhos existentes (manter — já no registro)

| Comando | Tecla | Tela |
|---|---|---|
| Play/pause | `Espaço` | global |
| Recuar/avançar 3s | `←` / `→` | bruto · pós |
| Velocidade ±0.25× | `Ctrl+J` / `Ctrl+K` | bruto · pós |
| Salvar aba ativa | `Ctrl/⌘+S` | pós |
| Desfazer timeline | `Ctrl+Z` | timeline |
| Travar seleção | `L` | pós |
| Início/fim da seleção | `I` / `O` | pós |
| Ajustar início/fim da seleção | (registro `pos.adjustSelection*`) | pós |
| Alternar Remotion ↔ bruto | `Ctrl+Alt+R` | pós |

## 2. Atalhos NOVOS exigidos pela estrutura de abas/painéis

Adicionar ao `shortcutsRegistry.ts` (rodar `assertNoShortcutConflicts` após cada inclusão):

| Id sugerido | Comando | Tecla sugerida | Tela |
|---|---|---|---|
| `wb.commandPalette` | Command palette (ir p/ projeto/etapa/corte) | `Ctrl/⌘+K` | global |
| `wb.nextTab` / `wb.prevTab` | Alternar abas de trabalho | `Ctrl+Tab` / `Ctrl+Shift+Tab` | global |
| `wb.goToTab1..9` | Ir direto à aba N | `Ctrl/⌘+1..9` | global |
| `wb.closeTab` | Fechar aba atual | `Ctrl/⌘+W` (fallback `Ctrl+Shift+X` se o browser capturar) | global |
| `wb.reopenTab` | Reabrir última aba fechada | `Ctrl/⌘+Shift+T` | global |
| `wb.toggleLeftPanel` | Colapsar/expandir painel esquerdo (cortes/cenas) | `Ctrl/⌘+[` | bruto · pós |
| `wb.toggleRightPanel` | Colapsar/expandir painel direito (trechos/layout) | `Ctrl/⌘+]` | bruto · pós |
| `wb.toggleRail` | Colapsar/expandir rail de projetos | `Ctrl/⌘+B` (convenção VS Code) | global |
| `wb.toggleQueue` | Colapsar/expandir fila global | `Ctrl/⌘+Shift+B` | global |
| `wb.toggleTimelineTools` | Expandir/recolher ferramentas da timeline | `T` | bruto |
| `wb.focusQueue` | Foco na fila / último job concluído | `Ctrl+Alt+Q` | global |
| `bruto.aprovar` / `bruto.rejeitar` | Formalizar A/R no registro | `A` / `R` | bruto |
| `bruto.fire` / `bruto.leitura` | Toggle 🔥 / 📖 | `F` / `D` | bruto |
| `bruto.proxCorte` / `bruto.antCorte` | Próximo/anterior corte da lista | `↓` / `↑` (fora de input) | bruto |
| `bruto.inAqui` / `bruto.outAqui` | Início/fim aqui na timeline | `[` / `]` | bruto |
| `wb.zenMode` | Zen: colapsa TODOS os painéis | `Ctrl/⌘+Shift+Z` | global |
| `wb.shortcuts` | Abrir página de atalhos | `Ctrl/⌘+Shift+/` | global |

**Customização de keybindings (fase 2, opcional):** overlay `keybindings` em localStorage `{shortcutId: comboString}`; página Atalhos ganha "editar" por linha (gravação de tecla, aviso de conflito via `assertNoShortcutConflicts` em runtime); export/import JSON.

## 3. Configurações — inventário completo

### Aplicação (backend `app_settings` — já existem, manter contratos)
- Nome do mascote (D-285) · Log level (`disabled|info|debug`) · Filtro global padrão (`filtro_global_padrao`) · Render: `cooldown_sec`, `overlay_concurrency`, `bundle_cache_enabled`, `overlay_codec`, `overlay_max_attempts`, `grade_global_quality` · `youtube_layout_padrao_global` (status/definir/limpar).

### Aparência (localStorage — novos, defaults primeiro)
- `wb-theme`: `claro | escuro | sistema` (default: sistema)
- `wb-palette`: `terracota | indigo | forest | plum | ink` (default: terracota; reusar `usePalette`)
- `wb-density`: `compacta | media` (default: media) — escala paddings/fontes das listas (−15%)
- `wb-reduce-motion`: bool (default: respeitar `prefers-reduced-motion`)

### Workbench (localStorage)
- `workbench-tabs-v1`: abas abertas + ativa (restaurar sessão)
- `workbench-panels-v1`: por tipo de painel: `{aberto: bool, largura?: px}` — larguras respeitam min/max (rail 180–280, esq. 200–320, dir. 260–380, fila 220–320)
- `wb-autocollapse`: bool (default true) — auto-colapso responsivo (ordem rail→fila→dir→esq; centro mín. 420px)
- `wb-queue-notify`: `nunca | toast | toast+som` ao concluir job (default: toast)
- `wb-tab-badges`: mostrar progresso nas abas (default: true)

### Editor (localStorage)
- `wb-timeline-tools`: ferramentas da timeline expandidas (default: true)
- `wb-timeline-height-ratio`: proporção player/timeline salva pelo resize handle (migra `editor-fase1-panels-v2`)
- `wb-waveform-zoom-default`: zoom inicial da onda (px/seg)
- `wb-seek-step`: 1 | 3 | 5 s (default 3 — hoje `SEEK_STEP_SEG`)
- `wb-speed-step`: 0.25 (default) | 0.5
- smartPlay, pointer mode, trecho lock: já persistidos onde estão — manter

### Página de Configurações — comportamento VS Code
- Busca global no topo filtrando TODAS as seções (Aplicação + Aparência + Workbench + Editor) por rótulo/descrição.
- Cada item: rótulo, descrição de 1 linha, controle, e "↺ padrão" quando modificado (indicador de valor não-default, como o marcador azul do VS Code).
- Rodapé: "Exportar configurações (JSON)" / "Importar" — serializa todas as chaves acima.
