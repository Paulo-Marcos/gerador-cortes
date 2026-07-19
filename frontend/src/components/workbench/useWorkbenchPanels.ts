import { useCallback, useEffect, useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// useWorkbenchPanels — estado dos painéis retráteis do shell
// Workbench (hand-off design_handoff_workbench, Etapa 0).
// Cada painel tem um estado DESEJADO (o que o usuário escolheu)
// e um estado EFETIVO (o desejado após o auto-colapso responsivo
// que garante >= 420px ao centro). Persistido em localStorage
// `workbench-panels-v1`.
// ─────────────────────────────────────────────────────────────

export type WorkbenchPanelId = 'rail' | 'cuts' | 'right' | 'fila' | 'cenas' | 'layout';

export interface PanelWidths {
  /** Largura aberta, em px. */
  open: number;
  /** Largura da barra vertical colapsada, em px. */
  collapsed: number;
}

/** Dimensões do hand-off (README §Dimensões-chave do shell). */
export const PANEL_WIDTHS: Record<WorkbenchPanelId, PanelWidths> = {
  rail: { open: 216, collapsed: 62 },
  cuts: { open: 236, collapsed: 40 },
  right: { open: 300, collapsed: 38 },
  fila: { open: 248, collapsed: 42 },
  cenas: { open: 232, collapsed: 40 },
  layout: { open: 260, collapsed: 38 },
};

/** Largura mínima garantida ao conteúdo central. */
export const CENTER_MIN_PX = 420;

/** Ordem de cedência do auto-colapso: rail → fila → direita → esquerda. */
export const AUTO_COLLAPSE_ORDER: readonly WorkbenchPanelId[] = [
  'rail',
  'fila',
  'right',
  'layout',
  'cuts',
  'cenas',
];

export type PanelOpenState = Record<WorkbenchPanelId, boolean>;

export const DEFAULT_OPEN_STATE: PanelOpenState = {
  rail: true,
  cuts: true,
  right: true,
  // CP1 (AUDITORIA-v2 §1/§12): fila global colapsada 40px por padrão.
  fila: false,
  cenas: true,
  layout: true,
};

export const PANELS_STORAGE_KEY = 'workbench-panels-v1';

const PANEL_IDS = Object.keys(PANEL_WIDTHS) as WorkbenchPanelId[];

export function isWorkbenchPanelId(value: unknown): value is WorkbenchPanelId {
  return typeof value === 'string' && (PANEL_IDS as string[]).includes(value);
}

export interface ResolvePanelsParams {
  /** Estado desejado (escolha do usuário) de cada painel. */
  desired: PanelOpenState;
  /** Painéis presentes na view atual (varia por etapa/aba). */
  active: readonly WorkbenchPanelId[];
  viewportWidth: number;
  /** Painel expandido manualmente por último — cede por último. */
  lastManualExpand?: WorkbenchPanelId | null;
}

/**
 * Aplica o auto-colapso responsivo: colapsa painéis na ordem
 * AUTO_COLLAPSE_ORDER até o centro ter >= CENTER_MIN_PX. O painel
 * expandido manualmente por último "vence" (só cede se, mesmo com
 * todos os outros colapsados, o centro ainda não couber).
 */
export function resolveEffectiveOpen(params: ResolvePanelsParams): PanelOpenState {
  const { desired, active, viewportWidth, lastManualExpand = null } = params;
  const effective: PanelOpenState = { ...desired };

  const totalWidth = () =>
    active.reduce(
      (total, id) => total + (effective[id] ? PANEL_WIDTHS[id].open : PANEL_WIDTHS[id].collapsed),
      0,
    );
  const centerFits = () => totalWidth() + CENTER_MIN_PX <= viewportWidth;

  for (const id of AUTO_COLLAPSE_ORDER) {
    if (centerFits()) break;
    if (id === lastManualExpand) continue;
    if (active.includes(id) && effective[id]) effective[id] = false;
  }

  // Último recurso: nem colapsando todos os outros coube — o manual cede também.
  if (!centerFits() && lastManualExpand && active.includes(lastManualExpand)) {
    effective[lastManualExpand] = false;
  }

  return effective;
}

export interface StoredPanelsState {
  desired: PanelOpenState;
  lastManualExpand: WorkbenchPanelId | null;
}

export function serializePanels(state: StoredPanelsState): string {
  return JSON.stringify(state);
}

/** Valida o JSON persistido; chaves desconhecidas são ignoradas e ausentes voltam ao default. */
export function parseStoredPanels(raw: string | null): StoredPanelsState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as { desired?: unknown; lastManualExpand?: unknown };
  if (typeof candidate.desired !== 'object' || candidate.desired === null) return null;

  const desired: PanelOpenState = { ...DEFAULT_OPEN_STATE };
  for (const id of PANEL_IDS) {
    const value = (candidate.desired as Record<string, unknown>)[id];
    if (typeof value === 'boolean') desired[id] = value;
  }
  const lastManualExpand = isWorkbenchPanelId(candidate.lastManualExpand)
    ? candidate.lastManualExpand
    : null;
  return { desired, lastManualExpand };
}

function readStoredPanels(): StoredPanelsState {
  if (typeof window === 'undefined') {
    return { desired: DEFAULT_OPEN_STATE, lastManualExpand: null };
  }
  try {
    const parsed = parseStoredPanels(window.localStorage.getItem(PANELS_STORAGE_KEY));
    if (parsed) return parsed;
  } catch {
    // localStorage indisponível — usa defaults
  }
  return { desired: DEFAULT_OPEN_STATE, lastManualExpand: null };
}

function currentViewportWidth(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth;
}

export interface UseWorkbenchPanelsResult {
  /** Estado efetivo (após auto-colapso) de cada painel ativo. */
  effective: PanelOpenState;
  /** Estado desejado pelo usuário (persistido). */
  desired: PanelOpenState;
  /** Alterna um painel; expandir manualmente o marca como "vencedor" do auto-colapso. */
  toggle: (id: WorkbenchPanelId) => void;
  /** Largura atual do painel em px (aberta ou colapsada conforme o efetivo). */
  widthOf: (id: WorkbenchPanelId) => number;
  viewportWidth: number;
}

export function useWorkbenchPanels(active: readonly WorkbenchPanelId[]): UseWorkbenchPanelsResult {
  const [stored, setStored] = useState<StoredPanelsState>(() => readStoredPanels());
  const [viewportWidth, setViewportWidth] = useState<number>(() => currentViewportWidth());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANELS_STORAGE_KEY, serializePanels(stored));
    } catch {
      // ignora — próximo load volta aos defaults
    }
  }, [stored]);

  const effective = useMemo(
    () =>
      resolveEffectiveOpen({
        desired: stored.desired,
        active,
        viewportWidth,
        lastManualExpand: stored.lastManualExpand,
      }),
    [stored, active, viewportWidth],
  );

  const toggle = useCallback(
    (id: WorkbenchPanelId) => {
      const isOpen = effective[id];
      setStored((prev) => ({
        desired: { ...prev.desired, [id]: !isOpen },
        lastManualExpand: !isOpen
          ? id
          : prev.lastManualExpand === id
            ? null
            : prev.lastManualExpand,
      }));
    },
    [effective],
  );

  const widthOf = useCallback(
    (id: WorkbenchPanelId) => (effective[id] ? PANEL_WIDTHS[id].open : PANEL_WIDTHS[id].collapsed),
    [effective],
  );

  return { effective, desired: stored.desired, toggle, widthOf, viewportWidth };
}
