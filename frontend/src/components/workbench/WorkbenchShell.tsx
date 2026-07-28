import { Suspense, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShortcuts, type ShortcutBinding } from '@/features/editor/shortcuts';
import { shortcutFromRegistry } from '@/features/editor/shortcutsRegistry';
import { GlobalQueue } from './GlobalQueue';
import { ProjectRail } from './ProjectRail';
import { ProjectStageBar } from './ProjectStageBar';
import { TabStrip } from './TabStrip';
import { WorkbenchPanelsProvider, useWorkbenchPanelsContext } from './WorkbenchPanelsProvider';
import { WorkbenchQueueProvider } from './useWorkbenchQueue';
import { WorkbenchTabsProvider, useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { activateTab, closeTab, type TabsState } from './useWorkbenchTabs';
import { routeToTab, tabPath } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// WorkbenchShell — shell novo (DE-PARA §0): tab strip no topo,
// rail de projetos à esquerda, conteúdo da rota no centro e fila
// global à direita. Rotas continuam a fonte da verdade: navegar
// abre/foca a aba correspondente (deep-links intactos).
// ─────────────────────────────────────────────────────────────

function RouteTabSync() {
  const { pathname, search } = useLocation();
  const { open } = useWorkbenchTabsContext();

  useEffect(() => {
    const tab = routeToTab(pathname, search);
    if (tab) open(tab);
  }, [pathname, search, open]);

  return null;
}

// Atalhos do shell (ATALHOS-E-CONFIGURACOES §2, ids wb.* do registro):
// painéis retráteis + ciclo/fechamento de abas.
function ShellShortcuts() {
  const navigate = useNavigate();
  const { state, tabs, activeIndex, replace } = useWorkbenchTabsContext();
  const { toggle, pagePanels } = useWorkbenchPanelsContext();

  const bindings = useMemo<ShortcutBinding[]>(() => {
    const aplicar = (proximo: TabsState) => {
      if (proximo === state) return;
      replace(proximo);
      const alvo = proximo.tabs[proximo.activeIndex];
      if (alvo) navigate(tabPath(alvo));
    };
    const cycleTab = (dir: -1 | 1) => {
      if (tabs.length === 0) return;
      aplicar(activateTab(state, (activeIndex + dir + tabs.length) % tabs.length));
    };
    const closeActive = () => aplicar(closeTab(state, activeIndex));
    return [
      shortcutFromRegistry('wb.toggleRail', () => toggle('rail')),
      shortcutFromRegistry('wb.toggleQueue', () => toggle('fila')),
      shortcutFromRegistry('wb.toggleLeftPanel', () => {
        const id = pagePanels.find((p) => p === 'cuts' || p === 'cenas');
        if (id) toggle(id);
      }),
      shortcutFromRegistry('wb.toggleRightPanel', () => {
        const id = pagePanels.find((p) => p === 'right' || p === 'layout');
        if (id) toggle(id);
      }),
      shortcutFromRegistry('wb.nextTab', () => cycleTab(1)),
      shortcutFromRegistry('wb.prevTab', () => cycleTab(-1)),
      shortcutFromRegistry('wb.closeTab', closeActive),
    ];
  }, [state, tabs, activeIndex, replace, navigate, toggle, pagePanels]);

  useShortcuts(bindings, true);
  return null;
}

export function WorkbenchShell() {
  return (
    <WorkbenchPanelsProvider>
      <WorkbenchTabsProvider>
        <WorkbenchQueueProvider>
          <RouteTabSync />
          <ShellShortcuts />
          <div className="flex h-screen flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
            <TabStrip />
            <ProjectStageBar />
            <div className="flex min-h-0 flex-1">
              <ProjectRail />
              <main className="min-w-0 flex-1 overflow-y-auto">
                <Suspense
                  fallback={
                    <div className="grid min-h-[60vh] place-items-center text-[var(--wb-text-dim)]">
                      <Loader2 className="animate-spin" aria-hidden />
                    </div>
                  }
                >
                  <Outlet />
                </Suspense>
              </main>
              <GlobalQueue />
            </div>
          </div>
        </WorkbenchQueueProvider>
      </WorkbenchTabsProvider>
    </WorkbenchPanelsProvider>
  );
}
