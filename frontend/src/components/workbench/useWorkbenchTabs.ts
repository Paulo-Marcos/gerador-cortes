import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// useWorkbenchTabs — abas de trabalho do shell Workbench
// (hand-off design_handoff_workbench, Etapa 0 / DE-PARA §0).
// Cada aba é um par {projetoId, etapa, corteId?}; a dupla
// projeto+etapa identifica a aba (abrir de novo foca a existente,
// atualizando o corteId). Persistido em localStorage
// `workbench-tabs-v1` e restaurado no load.
// ─────────────────────────────────────────────────────────────

export type WorkbenchEtapa = 'workspace' | 'cortes' | 'pos' | 'metadados' | 'revisao';

const ETAPAS: readonly WorkbenchEtapa[] = ['workspace', 'cortes', 'pos', 'metadados', 'revisao'];

export function isWorkbenchEtapa(value: unknown): value is WorkbenchEtapa {
  return typeof value === 'string' && (ETAPAS as readonly string[]).includes(value);
}

export interface WorkbenchTab {
  /** Id do projeto como vem da API (`Projeto.id`). */
  projetoId: string;
  etapa: WorkbenchEtapa;
  /** Id do corte focado dentro da etapa (`Corte.id`), quando houver. */
  corteId?: string;
}

export interface TabsState {
  tabs: WorkbenchTab[];
  /** Índice da aba ativa; -1 quando não há abas. */
  activeIndex: number;
}

export const EMPTY_TABS_STATE: TabsState = { tabs: [], activeIndex: -1 };

export const TABS_STORAGE_KEY = 'workbench-tabs-v1';

/** Duas abas são "a mesma" quando apontam para o mesmo projeto+etapa. */
export function isSameTab(a: WorkbenchTab, b: WorkbenchTab): boolean {
  return a.projetoId === b.projetoId && a.etapa === b.etapa;
}

/**
 * Abre (ou foca) uma aba. Se já existe aba do mesmo projeto+etapa,
 * ela é ativada — e o corteId é atualizado quando fornecido; caso
 * contrário a aba nova entra no final e vira a ativa.
 */
export function openTab(state: TabsState, tab: WorkbenchTab): TabsState {
  const existingIndex = state.tabs.findIndex((t) => isSameTab(t, tab));
  if (existingIndex >= 0) {
    const existing = state.tabs[existingIndex];
    const updated: WorkbenchTab =
      tab.corteId !== undefined && tab.corteId !== existing.corteId
        ? { ...existing, corteId: tab.corteId }
        : existing;
    // Já é a aba ativa e nada mudou — devolve o mesmo estado (evita
    // re-render em cascata na sincronização rota→aba).
    if (updated === existing && existingIndex === state.activeIndex) return state;
    const tabs =
      updated === existing
        ? state.tabs
        : state.tabs.map((t, i) => (i === existingIndex ? updated : t));
    return { tabs, activeIndex: existingIndex };
  }
  return { tabs: [...state.tabs, tab], activeIndex: state.tabs.length };
}

/**
 * Fecha a aba no índice dado. Fechar a ativa ativa a vizinha à
 * esquerda (ou a primeira restante); fechar outra mantém a ativa.
 */
export function closeTab(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length) return state;
  const tabs = state.tabs.filter((_, i) => i !== index);
  if (tabs.length === 0) return EMPTY_TABS_STATE;
  let activeIndex = state.activeIndex;
  if (index < activeIndex) {
    activeIndex -= 1;
  } else if (index === activeIndex) {
    activeIndex = Math.max(0, index - 1);
  }
  return { tabs, activeIndex: Math.min(activeIndex, tabs.length - 1) };
}

export function activateTab(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length) return state;
  if (index === state.activeIndex) return state;
  return { ...state, activeIndex: index };
}

export function serializeTabs(state: TabsState): string {
  return JSON.stringify(state);
}

function parseTab(value: unknown): WorkbenchTab | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { projetoId?: unknown; etapa?: unknown; corteId?: unknown };
  if (typeof candidate.projetoId !== 'string' || candidate.projetoId.length === 0) return null;
  if (!isWorkbenchEtapa(candidate.etapa)) return null;
  const tab: WorkbenchTab = { projetoId: candidate.projetoId, etapa: candidate.etapa };
  if (typeof candidate.corteId === 'string' && candidate.corteId.length > 0) {
    tab.corteId = candidate.corteId;
  }
  return tab;
}

/**
 * Valida o JSON persistido. Abas malformadas são descartadas
 * (mantendo as válidas) e o activeIndex é normalizado para o
 * intervalo válido.
 */
export function parseStoredTabs(raw: string | null): TabsState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as { tabs?: unknown; activeIndex?: unknown };
  if (!Array.isArray(candidate.tabs)) return null;

  const tabs = candidate.tabs.map(parseTab).filter((tab): tab is WorkbenchTab => tab !== null);
  if (tabs.length === 0) return EMPTY_TABS_STATE;

  const rawIndex = typeof candidate.activeIndex === 'number' ? candidate.activeIndex : 0;
  const activeIndex = Math.min(Math.max(0, Math.trunc(rawIndex)), tabs.length - 1);
  return { tabs, activeIndex };
}

function readStoredTabs(): TabsState {
  if (typeof window === 'undefined') return EMPTY_TABS_STATE;
  try {
    const parsed = parseStoredTabs(window.localStorage.getItem(TABS_STORAGE_KEY));
    if (parsed) return parsed;
  } catch {
    // localStorage indisponível — começa sem abas
  }
  return EMPTY_TABS_STATE;
}

export interface UseWorkbenchTabsResult {
  tabs: WorkbenchTab[];
  activeIndex: number;
  /** Aba ativa, ou null quando não há abas. */
  activeTab: WorkbenchTab | null;
  open: (tab: WorkbenchTab) => void;
  close: (index: number) => void;
  activate: (index: number) => void;
}

export function useWorkbenchTabs(): UseWorkbenchTabsResult {
  const [state, setState] = useState<TabsState>(() => readStoredTabs());

  useEffect(() => {
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, serializeTabs(state));
    } catch {
      // ignora — próximo load começa sem abas
    }
  }, [state]);

  const open = useCallback((tab: WorkbenchTab) => setState((prev) => openTab(prev, tab)), []);
  const close = useCallback((index: number) => setState((prev) => closeTab(prev, index)), []);
  const activate = useCallback((index: number) => setState((prev) => activateTab(prev, index)), []);

  return {
    tabs: state.tabs,
    activeIndex: state.activeIndex,
    activeTab: state.activeIndex >= 0 ? state.tabs[state.activeIndex] : null,
    open,
    close,
    activate,
  };
}
