import { Suspense, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useShortcuts, type ShortcutBinding } from '@/features/editor/shortcuts';
import { shortcutFromRegistry } from '@/features/editor/shortcutsRegistry';
import { finalReviewPath, postProductionPath } from '@/features/post-production/postProductionNavigation';
import { GlobalQueue } from './GlobalQueue';
import { ProjectRail } from './ProjectRail';
import { TabStrip } from './TabStrip';
import { WorkbenchPanelsProvider, useWorkbenchPanelsContext } from './WorkbenchPanelsProvider';
import { WorkbenchQueueProvider } from './useWorkbenchQueue';
import { WorkbenchTabsProvider, useWorkbenchTabsContext } from './WorkbenchTabsProvider';
import { ETAPA_DOT_TOKENS, ETAPA_LABELS, routeToTab, tabPath } from './workbenchRoutes';
import type { WorkbenchEtapa } from './useWorkbenchTabs';

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

const REGRA0_ETAPAS: readonly WorkbenchEtapa[] = ['workspace', 'cortes', 'pos', 'metadados', 'revisao'];

// Regra 0 (telas/README.md): barra de etapas do projeto/corte, sempre
// visível abaixo do TabStrip — 5 destinos do pipeline, um único ponto de
// implementação para as 5 telas (não duplica lógica de rota: reaproveita
// tabPath/postProductionPath/finalReviewPath já usados pelo resto do shell).
function WorkbenchStageBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { activeTab } = useWorkbenchTabsContext();

  const atual = routeToTab(pathname);
  const corteDaRota = atual?.corteId ?? searchParams.get('corte') ?? undefined;
  const corteId =
    corteDaRota ?? (activeTab?.projetoId === atual?.projetoId ? activeTab?.corteId : undefined);

  if (!atual) return null;
  const { projetoId, etapa: etapaAtiva } = atual;

  const irPara = (etapa: WorkbenchEtapa) => {
    if (etapa === 'pos' && corteId) return navigate(postProductionPath(projetoId, corteId));
    if (etapa === 'revisao' && corteId) return navigate(finalReviewPath(projetoId, corteId));
    navigate(tabPath({ projetoId, etapa, corteId: etapa === 'cortes' ? corteId : undefined }));
  };

  return (
    <div
      role="tablist"
      aria-label="Etapas do projeto"
      className="flex flex-none items-center gap-1 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-strip)] px-3 py-1.5"
    >
      {REGRA0_ETAPAS.map((etapa) => {
        const ativa = etapa === etapaAtiva;
        return (
          <button
            key={etapa}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => irPara(etapa)}
            className={cn(
              'flex items-center gap-1.5 rounded-[7px] border-l-[3px] px-2.5 py-1 text-[11px] font-semibold transition-colors',
              ativa
                ? 'border-l-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-text)]'
                : 'border-l-transparent text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
            )}
          >
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: ETAPA_DOT_TOKENS[etapa] }}
              aria-hidden
            />
            {ETAPA_LABELS[etapa]}
          </button>
        );
      })}
    </div>
  );
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
            <WorkbenchStageBar />
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
