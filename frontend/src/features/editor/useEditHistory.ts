import { useCallback, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// useEditHistory — histórico past/present/future para o estado de
// edição local (o `dirty: Partial<Corte>`) do editor de cortes.
//
// Por que existe (D-361): as alterações do editor (início/fim, editar
// desvio, intervalo manual, offset de áudio) acumulam num estado local
// antes do Ctrl+S. Sem histórico, uma alteração acidental não podia ser
// revertida a não ser reabrindo o corte. Este hook dá Ctrl+Z (undo) e
// Ctrl+Y (redo) sobre esse estado, no mesmo espírito do undo da timeline
// da pós (EditorFase2), mas com redo — que a pós ainda não tem.
//
// A lógica pura vive nas funções `history*` abaixo (testáveis sem React);
// o hook é só o invólucro de estado + refs para leitura síncrona.
// ─────────────────────────────────────────────────────────────

/** Snapshot imutável do histórico: passado, presente e futuro (redo). */
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Teto de snapshots por pilha — evita memória estourar em sessões longas. */
export const HISTORY_LIMIT = 100;

export function historyInit<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

/**
 * Registra um novo presente. Empilha o presente anterior no passado e
 * LIMPA o futuro (uma edição nova invalida o caminho de redo). Se o
 * próximo valor for idêntico (===) ao atual, é no-op — não polui o undo.
 */
export function historyPush<T>(
  state: HistoryState<T>,
  next: T,
  limit = HISTORY_LIMIT,
): HistoryState<T> {
  if (Object.is(state.present, next)) return state;
  const past = [...state.past, state.present];
  if (past.length > limit) past.shift();
  return { past, present: next, future: [] };
}

/** Desfaz: presente vai para o futuro, topo do passado vira presente. */
export function historyUndo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

/** Refaz: presente volta ao passado, primeiro do futuro vira presente. */
export function historyRedo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}

export interface EditHistory<T> {
  /** Presente atual (para render). */
  present: T;
  /** Leitura síncrona do presente — o ref é atualizado antes do re-render. */
  getPresent: () => T;
  canUndo: boolean;
  canRedo: boolean;
  /** Registra um novo presente (empilha o anterior, limpa o redo). */
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  /** Zera o histórico com um novo presente (troca de corte, pós-salvar). */
  reset: (value: T) => void;
}

export function useEditHistory<T>(initial: T): EditHistory<T> {
  // Ref é a fonte da verdade (leitura síncrona correta entre edições no
  // mesmo tick); o state serve só para forçar re-render.
  const ref = useRef<HistoryState<T>>(historyInit(initial));
  const [, setVersion] = useState(0);

  const commit = useCallback((next: HistoryState<T>) => {
    if (next === ref.current) return;
    ref.current = next;
    setVersion((v) => v + 1);
  }, []);

  const set = useCallback((next: T) => commit(historyPush(ref.current, next)), [commit]);
  const undo = useCallback(() => commit(historyUndo(ref.current)), [commit]);
  const redo = useCallback(() => commit(historyRedo(ref.current)), [commit]);
  const reset = useCallback((value: T) => commit(historyInit(value)), [commit]);
  const getPresent = useCallback(() => ref.current.present, []);

  const state = ref.current;
  return {
    present: state.present,
    getPresent,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    undo,
    redo,
    reset,
  };
}
