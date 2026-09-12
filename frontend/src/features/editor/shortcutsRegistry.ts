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
  | 'pos-cenas' // atalhos do CenasPanel
  | 'shorts'; // curadoria dos candidatos a short (D-476)

export type ShortcutId =
  // Curadoria de shorts (D-476)
  | 'shorts.seekBack5s'
  | 'shorts.seekFwd5s'
  | 'shorts.speedDown'
  | 'shorts.speedUp'
  | 'shorts.alternarVelocidade'
  | 'shorts.undo'
  | 'shorts.redo'
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
  | 'pos.toggleRemotion'
  // ── Shell Workbench (Etapa 7 / ATALHOS-E-CONFIGURACOES §2) ──────────
  // Desvios do hand-off por conflito/limite do runtime: Ctrl+B é o smart
  // play do Bruto → rail em Ctrl+Alt+B; Ctrl+Tab é do browser → abas em
  // Ctrl+Alt+←/→; sem mod ctrl+shift no matches() → fechar aba Ctrl+Alt+X.
  | 'wb.toggleRail'
  | 'wb.toggleQueue'
  | 'wb.toggleLeftPanel'
  | 'wb.toggleRightPanel'
  | 'wb.nextTab'
  | 'wb.prevTab'
  | 'wb.closeTab'
  // ── Editor Bruto (D-394: formalizados no registro p/ serem editáveis) ─
  | 'bruto.frameAnterior'
  | 'bruto.frameProximo'
  | 'bruto.seekBack5s'
  | 'bruto.seekFwd5s'
  | 'bruto.speedDown'
  | 'bruto.speedUp'
  | 'bruto.corteAnterior'
  | 'bruto.proximoCorte'
  | 'bruto.inAqui'
  | 'bruto.outAqui'
  | 'bruto.aprovar'
  | 'bruto.rejeitar'
  | 'bruto.fire'
  | 'bruto.leitura'
  | 'bruto.travarTrecho'
  | 'bruto.modoPonteiro'
  | 'bruto.adicionarTrecho'
  | 'bruto.dividirCorte'
  | 'bruto.juntarCorte'
  | 'bruto.alternarVelocidade'
  | 'bruto.removerTrecho'
  | 'bruto.smartPlay'
  | 'bruto.sincroniaNudgeMenos'
  | 'bruto.sincroniaNudgeMais'
  | 'bruto.alternarTempos'
  | 'bruto.alternarSincronia'
  | 'bruto.undo'
  | 'bruto.redo'
  | 'bruto.salvar'
  | 'bruto.gerarBruto'
  | 'bruto.abrirPasta'
  | 'bruto.mostrarAtalhos';

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
  // ── Shell Workbench (abas + painéis retráteis) ───────────────────────
  {
    id: 'wb.toggleRail',
    screen: 'global',
    key: 'b',
    mod: 'ctrl+alt',
    description: 'Colapsar/expandir rail de projetos',
    group: 'navegacao',
  },
  {
    id: 'wb.toggleQueue',
    screen: 'global',
    key: 'q',
    mod: 'ctrl+alt',
    description: 'Colapsar/expandir fila global de renders',
    group: 'navegacao',
  },
  {
    id: 'wb.toggleLeftPanel',
    screen: 'global',
    key: '[',
    mod: 'ctrl',
    description: 'Colapsar/expandir painel esquerdo (cortes/cenas)',
    group: 'navegacao',
  },
  {
    id: 'wb.toggleRightPanel',
    screen: 'global',
    key: ']',
    mod: 'ctrl',
    description: 'Colapsar/expandir painel direito (trechos/layout)',
    group: 'navegacao',
  },
  {
    id: 'wb.nextTab',
    screen: 'global',
    key: 'ArrowRight',
    mod: 'ctrl+alt',
    description: 'Proxima aba de trabalho',
    group: 'navegacao',
  },
  {
    id: 'wb.prevTab',
    screen: 'global',
    key: 'ArrowLeft',
    mod: 'ctrl+alt',
    description: 'Aba de trabalho anterior',
    group: 'navegacao',
  },
  {
    id: 'wb.closeTab',
    screen: 'global',
    key: 'x',
    mod: 'ctrl+alt',
    description: 'Fechar aba de trabalho atual',
    group: 'navegacao',
  },
  // ── Editor Bruto (D-394: cada funcionalidade com atalho editável) ────
  {
    id: 'bruto.frameAnterior',
    screen: 'bruto',
    key: ',',
    description: 'Frame anterior',
    group: 'player',
  },
  {
    id: 'bruto.frameProximo',
    screen: 'bruto',
    key: '.',
    description: 'Frame próximo',
    group: 'player',
  },
  {
    id: 'bruto.seekBack5s',
    screen: 'bruto',
    key: 'ArrowLeft',
    description: 'Retroceder 5 segundos',
    group: 'player',
  },
  {
    id: 'bruto.seekFwd5s',
    screen: 'bruto',
    key: 'ArrowRight',
    description: 'Avançar 5 segundos',
    group: 'player',
  },
  {
    id: 'bruto.speedDown',
    screen: 'bruto',
    key: 'j',
    mod: 'ctrl',
    description: 'Velocidade -0.25x',
    group: 'player',
  },
  {
    id: 'bruto.speedUp',
    screen: 'bruto',
    key: 'k',
    mod: 'ctrl',
    description: 'Velocidade +0.25x',
    group: 'player',
  },
  // D-575: ir e voltar entre 1x e a velocidade de trabalho. Afinar um corte
  // exige ouvir devagar, mas conferir o resultado exige 1x — e com Ctrl+J/K
  // isso custava varias teclas em cada troca.
  {
    id: 'bruto.alternarVelocidade',
    screen: 'bruto',
    key: 'u',
    mod: 'ctrl',
    description: 'Alternar 1x <-> velocidade de trabalho',
    group: 'player',
  },
  // D-476: espelham as teclas do Bruto de proposito. Quem cura shorts acabou de
  // sair do editor; trocar a tecla ali seria pedir para reaprender o que ja
  // esta na memoria muscular. O play/pause NAO entra aqui: espaco ja e
  // `player.togglePlay` no escopo global, e repeti-lo seria conflito real.
  {
    id: 'shorts.seekBack5s',
    screen: 'shorts',
    key: 'ArrowLeft',
    description: 'Retroceder 5 segundos',
    group: 'player',
  },
  {
    id: 'shorts.seekFwd5s',
    screen: 'shorts',
    key: 'ArrowRight',
    description: 'Avançar 5 segundos',
    group: 'player',
  },
  {
    id: 'shorts.speedDown',
    screen: 'shorts',
    key: 'j',
    mod: 'ctrl',
    description: 'Velocidade -0.25x',
    group: 'player',
  },
  {
    id: 'shorts.speedUp',
    screen: 'shorts',
    key: 'k',
    mod: 'ctrl',
    description: 'Velocidade +0.25x',
    group: 'player',
  },
  // D-581: o mesmo par que o Bruto ganhou na D-575, pela mesma razao e na
  // mesma tecla. Quem cura shorts acabou de sair do editor de bruto — afinar a
  // borda de um trecho pede ouvir devagar, conferir pede 1x, e com Ctrl+J/K
  // cada ida e volta custava varias teclas.
  {
    id: 'shorts.alternarVelocidade',
    screen: 'shorts',
    key: 'u',
    mod: 'ctrl',
    description: 'Alternar 1x <-> velocidade de trabalho',
    group: 'player',
  },
  // D-581: desfazer/refazer a curadoria. Mesmas teclas do Bruto — as duas
  // telas nunca coexistem, e trocar a tecla seria pedir para reaprender o que
  // ja esta na memoria muscular.
  {
    id: 'shorts.undo',
    screen: 'shorts',
    key: 'z',
    mod: 'ctrl',
    description: 'Desfazer a ultima gravacao (bordas, gancho, palco, decisao)',
    group: 'edicao',
    skipInEditable: true,
  },
  {
    id: 'shorts.redo',
    screen: 'shorts',
    key: 'y',
    mod: 'ctrl',
    description: 'Refazer a gravacao desfeita',
    group: 'edicao',
    skipInEditable: true,
  },
  {
    id: 'bruto.corteAnterior',
    screen: 'bruto',
    key: 'j',
    description: 'Corte anterior',
    group: 'navegacao',
  },
  {
    id: 'bruto.proximoCorte',
    screen: 'bruto',
    key: 'k',
    description: 'Próximo corte',
    group: 'navegacao',
  },
  {
    id: 'bruto.inAqui',
    screen: 'bruto',
    key: '[',
    description: 'Definir início no tempo atual',
    group: 'edicao',
  },
  {
    id: 'bruto.outAqui',
    screen: 'bruto',
    key: ']',
    description: 'Definir fim no tempo atual',
    group: 'edicao',
  },
  {
    id: 'bruto.aprovar',
    screen: 'bruto',
    key: 'a',
    description: 'Alternar aprovado',
    group: 'edicao',
  },
  {
    id: 'bruto.rejeitar',
    screen: 'bruto',
    key: 'r',
    description: 'Alternar rejeitado (excluir corte)',
    group: 'edicao',
  },
  {
    id: 'bruto.fire',
    screen: 'bruto',
    key: 'f',
    description: 'Toggle 🔥 fire',
    group: 'edicao',
  },
  {
    id: 'bruto.leitura',
    screen: 'bruto',
    key: 'l',
    description: 'Toggle 📖 leitura',
    group: 'edicao',
  },
  {
    id: 'bruto.travarTrecho',
    screen: 'bruto',
    key: 'l',
    mod: 'ctrl',
    description: 'Travar/destravar trecho',
    group: 'edicao',
  },
  {
    id: 'bruto.modoPonteiro',
    screen: 'bruto',
    key: 'p',
    mod: 'ctrl',
    description: 'Ativar/desativar modo ponteiro',
    group: 'edicao',
  },
  {
    id: 'bruto.adicionarTrecho',
    screen: 'bruto',
    key: 't',
    mod: 'ctrl+alt',
    description: 'Adicionar trecho no cursor',
    group: 'edicao',
  },
  {
    id: 'bruto.dividirCorte',
    screen: 'bruto',
    key: 'd',
    description: 'Dividir corte no ponteiro',
    group: 'edicao',
  },
  {
    id: 'bruto.juntarCorte',
    screen: 'bruto',
    key: 'j',
    mod: 'ctrl+alt',
    description: 'Juntar com o proximo corte',
    group: 'edicao',
  },
  {
    id: 'bruto.removerTrecho',
    screen: 'bruto',
    key: 'Delete',
    mod: 'ctrl',
    description: 'Remover trecho selecionado',
    group: 'edicao',
  },
  {
    id: 'bruto.smartPlay',
    screen: 'bruto',
    key: 'b',
    mod: 'ctrl',
    description: 'Reprodução sem cortes (smart play)',
    group: 'edicao',
  },
  // AUDITORIA-v2 §5 (CP5): nudge fino da Sincronia do áudio. Usa mod:'ctrl'
  // (em vez das teclas nuas ',' '.' pedidas na auditoria) porque
  // bruto.frameAnterior/bruto.frameProximo já ocupam ',' '.' sem modificador
  // nesta mesma tela — combo igual sem mod colidiria (assertNoShortcutConflicts).
  {
    id: 'bruto.sincroniaNudgeMenos',
    screen: 'bruto',
    key: ',',
    mod: 'ctrl',
    description: 'Sincronia do áudio: adiantar 10ms',
    group: 'edicao',
  },
  {
    id: 'bruto.sincroniaNudgeMais',
    screen: 'bruto',
    key: '.',
    mod: 'ctrl',
    description: 'Sincronia do áudio: atrasar 10ms',
    group: 'edicao',
  },
  // D-408: os dois paineis recolhiveis do Bruto so abriam por clique nos
  // icones da toolbar. Teclas nuas, como os vizinhos de veredito (A/R/F/L) e
  // D — no escopo 'bruto' as unicas letras livres eram justamente estas: 't'
  // sem modificador (ctrl+alt+T e outro atalho) e 'h'.
  {
    id: 'bruto.alternarTempos',
    screen: 'bruto',
    key: 't',
    description: 'Mostrar/ocultar os tempos do corte',
    group: 'edicao',
  },
  {
    id: 'bruto.alternarSincronia',
    screen: 'bruto',
    key: 'h',
    description: 'Mostrar/ocultar a sincronia do áudio',
    group: 'edicao',
  },
  {
    id: 'bruto.undo',
    screen: 'bruto',
    key: 'z',
    mod: 'ctrl',
    description: 'Desfazer alteração (início/fim, trecho, intervalo)',
    group: 'edicao',
    skipInEditable: true,
  },
  {
    id: 'bruto.redo',
    screen: 'bruto',
    key: 'y',
    mod: 'ctrl',
    description: 'Refazer alteração',
    group: 'edicao',
    skipInEditable: true,
  },
  {
    id: 'bruto.salvar',
    screen: 'bruto',
    key: 's',
    mod: 'any',
    description: 'Salvar mudanças',
    group: 'global',
  },
  {
    id: 'bruto.gerarBruto',
    screen: 'bruto',
    key: 'g',
    mod: 'any',
    description: 'Gerar/regerar vídeo bruto',
    group: 'global',
  },
  {
    id: 'bruto.abrirPasta',
    screen: 'bruto',
    key: 'o',
    mod: 'any',
    description: 'Abrir pasta do corte',
    group: 'global',
  },
  {
    id: 'bruto.mostrarAtalhos',
    screen: 'bruto',
    key: '?',
    mod: 'shift',
    description: 'Mostrar atalhos do editor',
    group: 'global',
  },
];

// ─────────────────────────────────────────────────────────────
// Overrides de keybinding (D-394): o usuário pode reatribuir a tecla
// de QUALQUER atalho do registro. Overlay em localStorage
// `wb-keybindings-v1` ({id: {key, mod?}}); os call sites recebem o
// combo efetivo via shortcutFromRegistry — reatribuição aplica ao
// recarregar a página.
// ─────────────────────────────────────────────────────────────

export const KEYBINDINGS_STORAGE_KEY = 'wb-keybindings-v1';

export interface KeyOverride {
  key: string;
  mod?: ShortcutBinding['mod'];
}

export type KeybindingsOverlay = Partial<Record<ShortcutId, KeyOverride>>;

const MODS_VALIDOS = new Set(['ctrl', 'shift', 'alt', 'ctrl+alt', 'any']);

export function parseKeybindingsOverlay(raw: string | null): KeybindingsOverlay {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null) return {};
  const overlay: KeybindingsOverlay = {};
  for (const [id, valor] of Object.entries(data as Record<string, unknown>)) {
    if (!REGISTRY_BY_ID.has(id as ShortcutId)) continue;
    if (typeof valor !== 'object' || valor === null) continue;
    const cand = valor as { key?: unknown; mod?: unknown };
    if (typeof cand.key !== 'string' || cand.key.length === 0) continue;
    const override: KeyOverride = { key: cand.key };
    if (typeof cand.mod === 'string' && MODS_VALIDOS.has(cand.mod)) {
      override.mod = cand.mod as ShortcutBinding['mod'];
    }
    overlay[id as ShortcutId] = override;
  }
  return overlay;
}

export function loadKeybindingsOverlay(): KeybindingsOverlay {
  if (typeof window === 'undefined') return {};
  try {
    return parseKeybindingsOverlay(window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Persiste (override=null remove a customização do id). */
export function saveKeybindingOverride(id: ShortcutId, override: KeyOverride | null): void {
  const overlay = loadKeybindingsOverlay();
  if (override) overlay[id] = override;
  else delete overlay[id];
  try {
    window.localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(overlay));
  } catch {
    // localStorage indisponível — customização não persiste
  }
}

export function clearKeybindingsOverlay(): void {
  try {
    window.localStorage.removeItem(KEYBINDINGS_STORAGE_KEY);
  } catch {
    // ignora
  }
}

/** Registro com os overrides do usuário aplicados. */
export function effectiveShortcutSpecs(
  overlay: KeybindingsOverlay = loadKeybindingsOverlay(),
): ShortcutSpec[] {
  return SHORTCUTS_REGISTRY.map((spec) => {
    const override = overlay[spec.id];
    return override ? { ...spec, key: override.key, mod: override.mod } : spec;
  });
}

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
  // D-394: aplica a customização do usuário (localStorage) sobre o default.
  const override = loadKeybindingsOverlay()[id];
  return {
    key: override?.key ?? spec.key,
    mod: override ? override.mod : spec.mod,
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
    global: ['global', 'bruto', 'pos', 'pos-timeline', 'pos-layout', 'pos-cenas', 'shorts'],
    bruto: ['bruto', 'global'],
    pos: ['pos', 'global', 'pos-timeline', 'pos-layout', 'pos-cenas'],
    'pos-timeline': ['pos-timeline', 'pos', 'global'],
    'pos-layout': ['pos-layout', 'pos', 'global'],
    'pos-cenas': ['pos-cenas', 'pos', 'global'],
    shorts: ['shorts', 'global'],
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
