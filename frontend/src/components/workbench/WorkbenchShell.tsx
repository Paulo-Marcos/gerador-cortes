import { Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { GlobalQueue } from './GlobalQueue';
import { ProjectRail } from './ProjectRail';
import { TabStrip } from './TabStrip';
import { WorkbenchPanelsProvider } from './WorkbenchPanelsProvider';
import { WorkbenchQueueProvider } from './useWorkbenchQueue';
import { WorkbenchTabsProvider, useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { routeToTab } from './workbenchRoutes';

// ─────────────────────────────────────────────────────────────
// WorkbenchShell — shell novo (DE-PARA §0): tab strip no topo,
// rail de projetos à esquerda, conteúdo da rota no centro e fila
// global à direita. Rotas continuam a fonte da verdade: navegar
// abre/foca a aba correspondente (deep-links intactos).
// ─────────────────────────────────────────────────────────────

function RouteTabSync() {
  const { pathname } = useLocation();
  const { open } = useWorkbenchTabsContext();

  useEffect(() => {
    const tab = routeToTab(pathname);
    if (tab) open(tab);
  }, [pathname, open]);

  return null;
}

export function WorkbenchShell() {
  return (
    <WorkbenchPanelsProvider>
      <WorkbenchTabsProvider>
        <WorkbenchQueueProvider>
          <RouteTabSync />
          <div className="flex h-screen flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
            <TabStrip />
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
