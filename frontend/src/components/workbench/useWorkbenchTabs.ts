import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// useWorkbenchTabs — abas de trabalho do shell Workbench.
//
// D-427: a aba é um CONTEXTO DE TRABALHO, no modelo do VSCode.
//   • aba de projeto — identificada por projeto + corte. A ETAPA
//     (Workspace/Bruto/Pós/Metadados/Revisão) é uma VISÃO da aba, não
//     parte da identidade: trocar de etapa continua na mesma guia.
//     Reabrir o mesmo corte foca a guia existente; abrir um corte
//     diferente abre outra guia (como abrir outro arquivo).
//   • aba global — Biblioteca, Ranking, Buscar, Padrões, Análises,
//     Atalhos e Configurações. Antes essas telas tomavam a área
//     central por cima da aba ativa; agora cada uma tem a sua guia.
//   • a guia Biblioteca é a HOME: fica sempre na primeira posição,
//     não fecha e não reordena. "Fechar todas" volta para ela.
//
// Persistido em localStorage `workbench-tabs-v2` (migra o v1).
// ─────────────────────────────────────────────────────────────

export type WorkbenchEtapa = 'workspace' | 'cortes' | 'pos' | 'metadados' | 'revisao';

const ETAPAS: readonly WorkbenchEtapa[] = ['workspace', 'cortes', 'pos', 'metadados', 'revisao'];

export function isWorkbenchEtapa(value: unknown): value is WorkbenchEtapa {
  return typeof value === 'string' && (ETAPAS as readonly string[]).includes(value);
}

export type GlobalTabId =
  | 'biblioteca'
  | 'ranking'
  | 'buscar'
  | 'thumbnails'
  | 'analises'
  | 'atalhos'
  | 'config';

const GLOBAIS: readonly GlobalTabId[] = [
  'biblioteca',
  'ranking',
  'buscar',
  'thumbnails',
  'analises',
  'atalhos',
  'config',
];

export function isGlobalTabId(value: unknown): value is GlobalTabId {
  return typeof value === 'string' && (GLOBAIS as readonly string[]).includes(value);
}

export interface ProjetoTab {
  kind: 'projeto';
  /** Id do projeto como vem da API (`Projeto.id`). */
  projetoId: string;
  /** Corte ao qual a aba está amarrada (`Corte.id`); ausente = aba do projeto. */
  corteId?: string;
  /** Visão atual da aba — muda sem trocar a identidade. */
  etapa: WorkbenchEtapa;
}

export interface GlobalTab {
  kind: 'global';
  global: GlobalTabId;
}

export type WorkbenchTab = ProjetoTab | GlobalTab;

export interface TabsState {
  tabs: WorkbenchTab[];
  /** Índice da aba ativa. */
  activeIndex: number;
}

export const HOME_TAB: GlobalTab = { kind: 'global', global: 'biblioteca' };

export function isHomeTab(tab: WorkbenchTab): boolean {
  return tab.kind === 'global' && tab.global === 'biblioteca';
}

/** Estado de partida (e destino do "fechar todas"): só a guia Biblioteca. */
export const INITIAL_TABS_STATE: TabsState = { tabs: [HOME_TAB], activeIndex: 0 };

export const TABS_STORAGE_KEY = 'workbench-tabs-v2';
const TABS_STORAGE_KEY_V1 = 'workbench-tabs-v1';

/** Identidade da aba — o que decide focar em vez de duplicar. */
export function tabKey(tab: WorkbenchTab): string {
  if (tab.kind === 'global') return `g:${tab.global}`;
  return tab.corteId ? `p:${tab.projetoId}:c:${tab.corteId}` : `p:${tab.projetoId}`;
}

export function isSameTab(a: WorkbenchTab, b: WorkbenchTab): boolean {
  return tabKey(a) === tabKey(b);
}

function comEtapa(tab: ProjetoTab, etapa: WorkbenchEtapa): ProjetoTab {
  return tab.etapa === etapa ? tab : { ...tab, etapa };
}

/** Ativa `index`, trocando a aba de lá por `tab` quando ela mudou. */
function focar(state: TabsState, index: number, tab: WorkbenchTab): TabsState {
  const inalterada = state.tabs[index] === tab;
  // Nada mudou e já era a ativa — devolve o mesmo objeto para não
  // disparar re-render em cascata na sincronização rota→aba.
  if (inalterada && state.activeIndex === index) return state;
  return {
    tabs: inalterada ? state.tabs : state.tabs.map((t, i) => (i === index ? tab : t)),
    activeIndex: index,
  };
}

function anexar(state: TabsState, tab: WorkbenchTab): TabsState {
  return { tabs: [...state.tabs, tab], activeIndex: state.tabs.length };
}

/**
 * Abre (ou foca) uma aba.
 *
 * Aba global e aba de projeto+corte já abertas são apenas focadas. Uma
 * aba de projeto ainda SEM corte ADOTA o primeiro corte aberto a partir
 * dela — é o que faz Workspace → Bruto continuar na mesma guia em vez de
 * deixar uma aba órfã para trás. Rota sem corte (Workspace, Metadados)
 * nunca cria guia nova quando já existe uma do mesmo projeto: só troca a
 * etapa da aba atual.
 */
export function openTab(state: TabsState, alvo: WorkbenchTab): TabsState {
  const existente = state.tabs.findIndex((t) => isSameTab(t, alvo));

  if (alvo.kind === 'global') {
    return existente >= 0 ? activateTab(state, existente) : anexar(state, alvo);
  }

  if (existente >= 0) {
    return focar(state, existente, comEtapa(state.tabs[existente] as ProjetoTab, alvo.etapa));
  }

  const ativa = state.tabs[state.activeIndex];
  const ativaDoProjeto =
    ativa && ativa.kind === 'projeto' && ativa.projetoId === alvo.projetoId ? ativa : null;

  if (alvo.corteId) {
    if (ativaDoProjeto && !ativaDoProjeto.corteId) {
      return focar(state, state.activeIndex, alvo);
    }
    return anexar(state, alvo);
  }

  if (ativaDoProjeto) {
    return focar(state, state.activeIndex, comEtapa(ativaDoProjeto, alvo.etapa));
  }
  const doProjeto = state.tabs.findIndex(
    (t) => t.kind === 'projeto' && t.projetoId === alvo.projetoId,
  );
  if (doProjeto >= 0) {
    return focar(state, doProjeto, comEtapa(state.tabs[doProjeto] as ProjetoTab, alvo.etapa));
  }
  return anexar(state, alvo);
}

/**
 * Fecha a aba no índice dado. Fechar a ativa ativa a vizinha à
 * esquerda; fechar outra mantém a ativa. A guia Biblioteca não fecha.
 */
export function closeTab(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length) return state;
  if (isHomeTab(state.tabs[index])) return state;
  const tabs = state.tabs.filter((_, i) => i !== index);
  if (tabs.length === 0) return INITIAL_TABS_STATE;
  let activeIndex = state.activeIndex;
  if (index < activeIndex) {
    activeIndex -= 1;
  } else if (index === activeIndex) {
    activeIndex = Math.max(0, index - 1);
  }
  return { tabs, activeIndex: Math.min(activeIndex, tabs.length - 1) };
}

/** Fecha tudo menos a aba dada (e a Biblioteca, que é fixa). */
export function closeOtherTabs(state: TabsState, index: number): TabsState {
  const alvo = state.tabs[index];
  if (!alvo) return state;
  const tabs = state.tabs.filter((tab, i) => i === index || isHomeTab(tab));
  if (tabs.length === state.tabs.length) return state;
  return { tabs, activeIndex: tabs.indexOf(alvo) };
}

/** Fecha as abas à direita da aba dada. */
export function closeTabsToRight(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length - 1) return state;
  const tabs = state.tabs.slice(0, index + 1);
  return { tabs, activeIndex: Math.min(state.activeIndex, index) };
}

/** Fecha todas as guias de trabalho e volta para a Biblioteca. */
export function closeAllTabs(): TabsState {
  return INITIAL_TABS_STATE;
}

/** Reordena arrastando. A Biblioteca fica presa na primeira posição. */
export function moveTab(state: TabsState, from: number, to: number): TabsState {
  const limite = state.tabs.length - 1;
  if (from === to) return state;
  if (from < 1 || to < 1 || from > limite || to > limite) return state;
  const ativa = state.tabs[state.activeIndex];
  const tabs = [...state.tabs];
  const [movida] = tabs.splice(from, 1);
  tabs.splice(to, 0, movida);
  return { tabs, activeIndex: tabs.indexOf(ativa) };
}

export function activateTab(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length) return state;
  if (index === state.activeIndex) return state;
  return { ...state, activeIndex: index };
}

/**
 * Remove abas de projetos que não existem mais (D-394: abas fantasmas
 * persistidas de outro banco/projeto removido). Abas globais sempre
 * sobrevivem. Mantém a aba ativa se ela sobreviver; senão ativa a
 * vizinha mais próxima.
 */
export function pruneTabs(state: TabsState, projetosValidos: ReadonlySet<string>): TabsState {
  const valida = (tab: WorkbenchTab) =>
    tab.kind === 'global' || projetosValidos.has(tab.projetoId);
  if (state.tabs.every(valida)) return state;
  const ativa = state.tabs[state.activeIndex];
  const tabs = state.tabs.filter(valida);
  if (tabs.length === 0) return INITIAL_TABS_STATE;
  const indiceAtiva = ativa ? tabs.indexOf(ativa) : -1;
  return {
    tabs,
    activeIndex: indiceAtiva >= 0 ? indiceAtiva : Math.min(state.activeIndex, tabs.length - 1),
  };
}

export function serializeTabs(state: TabsState): string {
  return JSON.stringify(state);
}

/** Aceita o formato v2 e o v1 (aba sem `kind`, uma por projeto+etapa). */
function parseTab(value: unknown): WorkbenchTab | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as {
    kind?: unknown;
    global?: unknown;
    projetoId?: unknown;
    etapa?: unknown;
    corteId?: unknown;
  };
  if (candidate.kind === 'global') {
    return isGlobalTabId(candidate.global) ? { kind: 'global', global: candidate.global } : null;
  }
  if (typeof candidate.projetoId !== 'string' || candidate.projetoId.length === 0) return null;
  if (!isWorkbenchEtapa(candidate.etapa)) return null;
  const tab: ProjetoTab = {
    kind: 'projeto',
    projetoId: candidate.projetoId,
    etapa: candidate.etapa,
  };
  if (typeof candidate.corteId === 'string' && candidate.corteId.length > 0) {
    tab.corteId = candidate.corteId;
  }
  return tab;
}

/** Biblioteca sempre presente e sempre primeira. */
function normalizarHome(tabs: WorkbenchTab[]): WorkbenchTab[] {
  const indice = tabs.findIndex(isHomeTab);
  if (indice === 0) return tabs;
  if (indice < 0) return [HOME_TAB, ...tabs];
  return [tabs[indice], ...tabs.filter((_, i) => i !== indice)];
}

/**
 * Valida o JSON persistido. Abas malformadas são descartadas (mantendo
 * as válidas), abas de mesma identidade colapsam numa só — é assim que
 * as várias abas por etapa do v1 viram uma aba de trabalho — e o
 * activeIndex é normalizado para o intervalo válido.
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

  const vistos = new Set<string>();
  const unicas: WorkbenchTab[] = [];
  for (const bruta of candidate.tabs) {
    const tab = parseTab(bruta);
    if (!tab) continue;
    const chave = tabKey(tab);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicas.push(tab);
  }
  if (unicas.length === 0) return INITIAL_TABS_STATE;

  const rawIndex = typeof candidate.activeIndex === 'number' ? candidate.activeIndex : 0;
  const ativa = unicas[Math.min(Math.max(0, Math.trunc(rawIndex)), unicas.length - 1)];
  const tabs = normalizarHome(unicas);
  return { tabs, activeIndex: Math.max(0, tabs.indexOf(ativa)) };
}

function readStoredTabs(): TabsState {
  if (typeof window === 'undefined') return INITIAL_TABS_STATE;
  try {
    const atual = parseStoredTabs(window.localStorage.getItem(TABS_STORAGE_KEY));
    if (atual) return atual;
    const legado = parseStoredTabs(window.localStorage.getItem(TABS_STORAGE_KEY_V1));
    if (legado) return legado;
  } catch {
    // localStorage indisponível — começa só com a Biblioteca
  }
  return INITIAL_TABS_STATE;
}

export interface UseWorkbenchTabsResult {
  state: TabsState;
  tabs: WorkbenchTab[];
  activeIndex: number;
  /** Aba ativa, ou null quando o índice está fora (estado corrompido). */
  activeTab: WorkbenchTab | null;
  /** Sincroniza rota → aba (abre ou foca). Não navega. */
  open: (tab: WorkbenchTab) => void;
  /** Aplica um estado calculado pelas funções puras (fechar, mover, ativar). */
  replace: (next: TabsState) => void;
  /** Fecha abas de projetos fora da lista (abas fantasmas). */
  prune: (projetosValidos: ReadonlySet<string>) => void;
}

export function useWorkbenchTabs(): UseWorkbenchTabsResult {
  const [state, setState] = useState<TabsState>(() => readStoredTabs());

  useEffect(() => {
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, serializeTabs(state));
    } catch {
      // ignora — próximo load começa só com a Biblioteca
    }
  }, [state]);

  const open = useCallback((tab: WorkbenchTab) => setState((prev) => openTab(prev, tab)), []);
  const replace = useCallback((next: TabsState) => setState(next), []);
  const prune = useCallback(
    (projetosValidos: ReadonlySet<string>) => setState((prev) => pruneTabs(prev, projetosValidos)),
    [],
  );

  return {
    state,
    tabs: state.tabs,
    activeIndex: state.activeIndex,
    activeTab: state.tabs[state.activeIndex] ?? null,
    open,
    replace,
    prune,
  };
}
