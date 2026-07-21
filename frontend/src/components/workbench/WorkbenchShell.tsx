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
import { routeToTab, tabPath } from './workbenchRoutes';

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

// Atalhos do shell (ATALHOS-E-CONFIGURACOES §2, ids wb.* do registro):
// painéis retráteis + ciclo/fechamento de abas.
function ShellShortcuts() {
  const navigate = useNavigate();
  const { tabs, activeIndex, activate, close } = useWorkbenchTabsContext();
  const { toggle, pagePanels } = useWorkbenchPanelsContext();

  const bindings = useMemo<ShortcutBinding[]>(() => {
    const cycleTab = (dir: -1 | 1) => {
      if (tabs.length === 0) return;
      const next = (activeIndex + dir + tabs.length) % tabs.length;
      activate(next);
      navigate(tabPath(tabs[next]));
    };
    const closeActive = () => {
      if (activeIndex < 0) return;
      close(activeIndex);
      const restantes = tabs.filter((_, i) => i !== activeIndex);
      if (restantes.length === 0) {
        navigate('/projetos');
        return;
      }
      navigate(tabPath(restantes[Math.max(0, activeIndex - 1)]));
    };
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
  }, [tabs, activeIndex, activate, close, navigate, toggle, pagePanels]);

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
