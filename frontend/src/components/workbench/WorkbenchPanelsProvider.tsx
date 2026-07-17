import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useWorkbenchPanels,
  type UseWorkbenchPanelsResult,
  type WorkbenchPanelId,
} from './useWorkbenchPanels';

// ─────────────────────────────────────────────────────────────
// Estado ÚNICO dos painéis do shell. O rail e a fila são fixos;
// cada página registra seus painéis (cortes/trechos, cenas/layout)
// via useRegisterPagePanels para participarem do auto-colapso.
// ─────────────────────────────────────────────────────────────

interface WorkbenchPanelsContextValue extends UseWorkbenchPanelsResult {
  setPagePanels: (ids: readonly WorkbenchPanelId[]) => void;
  /** Painéis registrados pela página atual (alvo dos atalhos Ctrl+[ / Ctrl+]). */
  pagePanels: readonly WorkbenchPanelId[];
}

const WorkbenchPanelsContext = createContext<WorkbenchPanelsContextValue | null>(null);

const SHELL_PANELS: readonly WorkbenchPanelId[] = ['rail', 'fila'];

export function WorkbenchPanelsProvider({ children }: { children: ReactNode }) {
  const [pagePanels, setPagePanels] = useState<readonly WorkbenchPanelId[]>([]);
  const active = useMemo(() => [...SHELL_PANELS, ...pagePanels], [pagePanels]);
  const panels = useWorkbenchPanels(active);

  const value = useMemo<WorkbenchPanelsContextValue>(
    () => ({ ...panels, setPagePanels, pagePanels }),
    [panels, pagePanels],
  );

  return (
    <WorkbenchPanelsContext.Provider value={value}>{children}</WorkbenchPanelsContext.Provider>
  );
}

export function useWorkbenchPanelsContext(): WorkbenchPanelsContextValue {
  const context = useContext(WorkbenchPanelsContext);
  if (!context) {
    throw new Error('useWorkbenchPanelsContext must be used inside WorkbenchPanelsProvider');
  }
  return context;
}

/**
 * Registra os painéis retráteis da página atual enquanto ela está
 * montada (ex.: editor registra ['cuts','right']).
 */
export function useRegisterPagePanels(ids: readonly WorkbenchPanelId[]): void {
  const { setPagePanels } = useWorkbenchPanelsContext();
  const key = ids.join(',');
  useEffect(() => {
    setPagePanels(key ? (key.split(',') as WorkbenchPanelId[]) : []);
    return () => setPagePanels([]);
  }, [key, setPagePanels]);
}
