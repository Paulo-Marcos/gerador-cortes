import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// useProjetosFixados — projetos fixados no rail (D-400). Fixar
// prende o projeto no topo do rail e o mantém lá mesmo sem aba
// aberta nem pipeline em andamento — é o acesso rápido aos
// projetos em que se está trabalhando. Persistido em localStorage
// `workbench-pins-v1`; a ordem do array é a ordem de fixação.
// ─────────────────────────────────────────────────────────────

export const PINS_STORAGE_KEY = 'workbench-pins-v1';

/** Ids de projeto fixados, na ordem em que foram fixados. */
export type PinsState = readonly string[];

export const EMPTY_PINS: PinsState = [];

/** Fixa o projeto no fim da lista; se já estiver fixado, solta. */
export function togglePin(fixados: PinsState, projetoId: string): PinsState {
  return fixados.includes(projetoId)
    ? fixados.filter((id) => id !== projetoId)
    : [...fixados, projetoId];
}

/**
 * Solta pins de projetos que não existem mais (mesmo caso das abas
 * fantasmas do D-394: banco trocado ou projeto removido). Devolve o
 * mesmo array quando nada muda, para não disparar re-render à toa.
 */
export function prunePins(fixados: PinsState, projetosValidos: ReadonlySet<string>): PinsState {
  if (fixados.every((id) => projetosValidos.has(id))) return fixados;
  return fixados.filter((id) => projetosValidos.has(id));
}

export function serializePins(fixados: PinsState): string {
  return JSON.stringify(fixados);
}

/** Valida o JSON persistido; entradas malformadas e duplicadas são descartadas. */
export function parseStoredPins(raw: string | null): PinsState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const ids = data.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

function readStoredPins(): PinsState {
  if (typeof window === 'undefined') return EMPTY_PINS;
  try {
    const parsed = parseStoredPins(window.localStorage.getItem(PINS_STORAGE_KEY));
    if (parsed) return parsed;
  } catch {
    // localStorage indisponível — começa sem projetos fixados
  }
  return EMPTY_PINS;
}

export interface UseProjetosFixadosResult {
  fixados: PinsState;
  isFixado: (projetoId: string) => boolean;
  toggle: (projetoId: string) => void;
  /** Solta pins de projetos fora da lista (pins fantasmas). */
  prune: (projetosValidos: ReadonlySet<string>) => void;
}

export function useProjetosFixados(): UseProjetosFixadosResult {
  const [fixados, setFixados] = useState<PinsState>(() => readStoredPins());

  useEffect(() => {
    try {
      window.localStorage.setItem(PINS_STORAGE_KEY, serializePins(fixados));
    } catch {
      // ignora — próximo load começa sem projetos fixados
    }
  }, [fixados]);

  const isFixado = useCallback((projetoId: string) => fixados.includes(projetoId), [fixados]);
  const toggle = useCallback(
    (projetoId: string) => setFixados((prev) => togglePin(prev, projetoId)),
    [],
  );
  const prune = useCallback(
    (projetosValidos: ReadonlySet<string>) =>
      setFixados((prev) => prunePins(prev, projetosValidos)),
    [],
  );

  return { fixados, isFixado, toggle, prune };
}
