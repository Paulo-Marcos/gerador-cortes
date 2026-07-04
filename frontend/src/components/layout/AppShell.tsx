import { Suspense, useState } from 'react';
import { Bell, ChevronRight, Loader2 } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { IconButton } from '@/components/ui/icon-button';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';

const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/projetos\/[^/]+\/cortes/, 'Editor'],
  [/^\/projetos\/[^/]+\/metadados/, 'Metadados'],
  [/^\/projetos\/[^/]+\/final-review/, 'Revisão final'],
  [/^\/projetos\/[^/]+\/(post-production|export)/, 'Pós-produção'],
  [/^\/projetos\/[^/]+$/, 'Workspace'],
  [/^\/buscar-lives/, 'Captura'],
  [/^\/projetos/, 'Biblioteca'],
];

function getRouteLabel(pathname: string) {
  return ROUTE_LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'CortadorLive';
}

export function AppShell() {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const label = getRouteLabel(location.pathname);
  const immersiveWorkbench =
    /^\/buscar-lives/.test(location.pathname) ||
    /^\/projetos\/[^/]+\/(cortes|metadados|post-production|final-review|export)/.test(
      location.pathname,
    );
  // No editor (cortes/pos/final-review) o `UnifiedSidebar` substitui a sidebar
  // global. Escondemos a Sidebar antiga e zeramos o padding-left para o
  // novo componente posicionar-se no canto.
  const editorImmersive = /^\/projetos\/[^/]+\/(cortes|post-production|final-review)/.test(
    location.pathname,
  );

  return (
    <div className="min-h-screen bg-[var(--wb-bg)] text-[var(--wb-text)]">
      {!editorImmersive && <Sidebar onOpenSettings={() => setSettingsOpen(true)} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <div className={editorImmersive ? 'min-h-screen' : 'min-h-screen pl-16'}>
        {!immersiveWorkbench && (
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-6 text-sm text-[var(--wb-text-mute)]">
            <span className="font-code text-xs text-[var(--wb-text-dim)]">cortes/v2</span>
            <ChevronRight size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
            <span className="font-medium text-[var(--wb-text)]">{label}</span>
            <div className="flex-1" />
            <span className="hidden items-center gap-2 text-xs sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Sincronizado
            </span>
            <IconButton aria-label="Notificacoes" title="Notificacoes">
              <Bell aria-hidden />
            </IconButton>
          </header>
        )}
        <main className={immersiveWorkbench ? 'min-h-screen' : 'min-h-[calc(100vh-3.5rem)]'}>
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
      </div>
    </div>
  );
}
