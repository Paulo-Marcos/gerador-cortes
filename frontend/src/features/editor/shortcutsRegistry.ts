/**
 * Repositorio central de atalhos do editor.
 *
 * Por que existe (I-029): atalhos eram declarados ad-hoc em cada tela
 * (PlayerPanel, EditorFase2, ScenesPostProductionPage, RawProductionPage,
 * YoutubeLayoutPanel...) e era impossivel saber se um Ctrl+L novo nao
 * conflitava com algo existente. Este registro:
 *
 *   1. Lista TODOS os atalhos por tela em um unico lugar.
 *   2. Expoe uma funcao `assertNoShortcutConflicts` rodada em dev/build
 *      que detecta conflitos antes que eles cheguem ao usuario.
 *   3. Serve de fonte unica para a tela "Atalhos" (Help/Keyboard) e para
 *      a documentacao.
 *
 * Convencao: ao adicionar um atalho novo, adicione-o aqui ANTES de
 * declarar o binding no componente. Use `shortcutFromRegistry(id)` para
 * criar o ShortcutBinding compativel com `useShortcuts`.
 */

import type { ShortcutBinding } from './shortcuts';

export type ShortcutScreen =
  | 'global'
  | 'bruto' // tela de bruta (RawProductionPage)
  | 'pos' // tela de pos (ScenesPostProductionPage + EditorFase2)
  | 'pos-timeline' // atalhos especificos da Timeline da Pos
  | 'pos-layout' // atalhos do YoutubeLayoutPanel
  | 'pos-cenas'; // atalhos do CenasPanel

export type ShortcutId =
  // Global / Player
  | 'player.togglePlay'
  | 'player.seekBackward3s'
  | 'player.seekForward3s'
  | 'player.speedDown'
  | 'player.speedUp'
  // Salvar
  | 'pos.save'
  // Selecao / pin de segmento (Pos)
  | 'pos.toggleSelectionLock'
  | 'pos.seekToSelectionStart'
  | 'pos.seekToSelectionEnd'
  | 'pos.adjustSelectionStart'
  | 'pos.adjustSelectionEnd'
  // Undo da timeline (regioes + layout)
  | 'pos.undoTimeline'
  // Preview Remotion
  | 'pos.toggleRemotion';

export interface ShortcutSpec {
  id: ShortcutId;
  screen: ShortcutScreen;
  key: string;
  /** Combo no mesmo formato aceito por ShortcutBinding. */
  mod?: ShortcutBinding['mod'];
  description: string;
  group: ShortcutBinding['group'];
  /** Repassado ao ShortcutBinding — combos de texto (Ctrl+Z) cedem ao input. */
  skipInEditable?: boolean;
}

/**
 * Registro completo. Mantenha a ordem por tela para facilitar revisao em
 * code review.
 */
export const SHORTCUTS_REGISTRY: readonly ShortcutSpec[] = [
  // ── Player (compartilhado bruto/pos) ─────────────────────────────────
  {
    id: 'player.togglePlay',
    screen: 'global',
    key: ' ',
    description: 'Play / pause',
    group: 'player',
  },
  {
    id: 'player.seekBackward3s',
    screen: 'pos',
    key: 'ArrowLeft',
    description: 'Recuar 3 segundos',
    group: 'player',
  },
  {
    id: 'player.seekForward3s',
    screen: 'pos',
    key: 'ArrowRight',
    description: 'Avancar 3 segundos',
    group: 'player',
  },
  {
    id: 'player.speedDown',
    screen: 'pos',
    key: 'j',
    mod: 'ctrl',
    description: 'Velocidade -0.25x',
    group: 'player',
  },
  {
    id: 'player.speedUp',
    screen: 'pos',
    key: 'k',
    mod: 'ctrl',
    description: 'Velocidade +0.25x',
    group: 'player',
  },
  // ── Editor Pos (Cenas + Layout YT + Filtros) ─────────────────────────
  {
    id: 'pos.save',
    screen: 'pos',
    key: 's',
    mod: 'any',
    description: 'Salvar aba ativa (Cenas ou Layout)',
    group: 'global',
  },
  {
    id: 'pos.toggleRemotion',
    screen: 'pos',
    key: 'r',
    mod: 'ctrl+alt',
    description: 'Alternar preview Remotion (cenas) e video bruto',
    group: 'player',
  },
  // ── Timeline da Pos (seleção/pin/ajuste) ─────────────────────────────
  {
    id: 'pos.toggleSelectionLock',
    screen: 'pos-timeline',
    key: 'l',
    mod: 'ctrl',
    description: 'Travar/destravar segmento selecionado (alvo de [ ])',
    group: 'edicao',
  },
  {
    id: 'pos.adjustSelectionStart',
    screen: 'pos-timeline',
    key: '[',
    description: 'Mover INICIO do segmento travado para o tempo atual',
    group: 'edicao',
  },
  {
    id: 'pos.adjustSelectionEnd',
    screen: 'pos-timeline',
    key: ']',
    description: 'Mover FIM do segmento travado para o tempo atual',
    group: 'edicao',
  },
  {
    id: 'pos.seekToSelectionStart',
    screen: 'pos-timeline',
    key: ',',
    mod: 'ctrl',
    description: 'Seek para o INICIO do segmento/cena selecionado',
    group: 'edicao',
  },
  {
    id: 'pos.seekToSelectionEnd',
    screen: 'pos-timeline',
    key: '.',
    mod: 'ctrl',
    description: 'Seek para o FIM do segmento/cena selecionado',
    group: 'edicao',
  },
  {
    id: 'pos.undoTimeline',
    screen: 'pos-timeline',
    key: 'z',
    mod: 'ctrl',
    description: 'Desfazer ultima alteracao da timeline (regiao/layout)',
    group: 'edicao',
    skipInEditable: true,
  },
];

const REGISTRY_BY_ID = new Map<ShortcutId, ShortcutSpec>(
  SHORTCUTS_REGISTRY.map((spec) => [spec.id, spec]),
);

/**
 * Constroi um ShortcutBinding a partir de uma entrada do registro,
 * injetando a `action` callback do call site.
 *
 * Falha cedo (throw) se o id nao existir no registro — isso transforma o
 * registro em fonte unica de verdade.
 */
export function shortcutFromRegistry(id: ShortcutId, action: () => void): ShortcutBinding {
  const spec = REGISTRY_BY_ID.get(id);
  if (!spec) {
    throw new Error(`Shortcut id ${id} nao registrado em shortcutsRegistry.ts`);
  }
  return {
    key: spec.key,
    mod: spec.mod,
    group: spec.group,
    description: spec.description,
    action,
    skipInEditable: spec.skipInEditable,
  };
}

/**
 * Chave canonica do atalho (`Ctrl+L`, `Shift+Tab`, ` `, etc.) — usada para
 * detectar conflitos. Mesmo combo apertado dispara o mesmo handler de
 * matches() em shortcuts.ts.
 */
export function shortcutCombo(spec: { key: string; mod?: ShortcutBinding['mod'] }): string {
  const parts: string[] = [];
  if (spec.mod === 'ctrl' || spec.mod === 'any') parts.push('Ctrl');
  if (spec.mod === 'ctrl+alt') parts.push('Ctrl', 'Alt');
  if (spec.mod === 'shift') parts.push('Shift');
  if (spec.mod === 'alt') parts.push('Alt');
  parts.push(spec.key === ' ' ? 'Space' : spec.key.toUpperCase());
  return parts.join('+');
}

/**
 * Detecta colisao de atalhos no registro: mesma combinacao apertada por
 * mais de uma tela que possa estar ativa simultaneamente.
 *
 * Telas que CO-EXISTEM: 'global' + qualquer outra; e dentro de Pos:
 * 'pos' + 'pos-timeline' + 'pos-layout' + 'pos-cenas'.
 *
 * Lanca Error se detectar conflito — o build/dev pode chamar isso no
 * boot para falhar cedo. Em prod, importar apenas em testes.
 */
export function assertNoShortcutConflicts(
  registry: readonly ShortcutSpec[] = SHORTCUTS_REGISTRY,
): void {
  // Grupos que co-existem na mesma tela.
  const COEXIST: Record<ShortcutScreen, ShortcutScreen[]> = {
    global: ['global', 'bruto', 'pos', 'pos-timeline', 'pos-layout', 'pos-cenas'],
    bruto: ['bruto', 'global'],
    pos: ['pos', 'global', 'pos-timeline', 'pos-layout', 'pos-cenas'],
    'pos-timeline': ['pos-timeline', 'pos', 'global'],
    'pos-layout': ['pos-layout', 'pos', 'global'],
    'pos-cenas': ['pos-cenas', 'pos', 'global'],
  };
  const conflitos: string[] = [];
  for (let i = 0; i < registry.length; i += 1) {
    for (let j = i + 1; j < registry.length; j += 1) {
      const a = registry[i];
      const b = registry[j];
      if (shortcutCombo(a) !== shortcutCombo(b)) continue;
      if (!COEXIST[a.screen].includes(b.screen)) continue;
      conflitos.push(`${shortcutCombo(a)} — ${a.id} (${a.screen}) x ${b.id} (${b.screen})`);
    }
  }
  if (conflitos.length > 0) {
    throw new Error(`Conflito de atalhos em SHORTCUTS_REGISTRY:\n  ${conflitos.join('\n  ')}`);
  }
}

/** Atalhos visiveis numa tela especifica (para UI de Help). */
export function shortcutsForScreen(screen: ShortcutScreen): ShortcutSpec[] {
  return SHORTCUTS_REGISTRY.filter((spec) => {
    if (screen === 'pos') {
      return spec.screen === 'pos' || spec.screen === 'global';
    }
    if (screen === 'bruto') {
      return spec.screen === 'bruto' || spec.screen === 'global';
    }
    return spec.screen === screen || spec.screen === 'global';
  });
}
