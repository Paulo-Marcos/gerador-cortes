import { createContext, useContext, type ReactNode } from 'react';
import { useWorkbenchTabs, type UseWorkbenchTabsResult } from './useWorkbenchTabs';

// Estado único das abas de trabalho, compartilhado entre TabStrip,
// sincronização de rota e fila global ("abrir na aba").

const WorkbenchTabsContext = createContext<UseWorkbenchTabsResult | null>(null);

export function WorkbenchTabsProvider({ children }: { children: ReactNode }) {
  const value = useWorkbenchTabs();
  return <WorkbenchTabsContext.Provider value={value}>{children}</WorkbenchTabsContext.Provider>;
}

export function useWorkbenchTabsContext(): UseWorkbenchTabsResult {
  const context = useContext(WorkbenchTabsContext);
  if (!context) {
    throw new Error('useWorkbenchTabsContext must be used inside WorkbenchTabsProvider');
  }
  return context;
}
