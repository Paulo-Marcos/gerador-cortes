import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useWorkbenchPanelsContext } from './WorkbenchPanelsProvider';
import type { WorkbenchPanelId } from './useWorkbenchPanels';

// ─────────────────────────────────────────────────────────────
// PanelShell — painel retrátil genérico do shell Workbench
// (DE-PARA §0). Aberto: header com label mono + conteúdo.
// Colapsado: barra vertical clicável com chevron, indicador vivo
// e label em writing-mode vertical. Transição width .22s ease.
// ─────────────────────────────────────────────────────────────

interface PanelShellProps {
  id: WorkbenchPanelId;
  side: 'left' | 'right';
  /** Label mono do header e da barra colapsada (ex.: "CORTES · 12/18"). */
  title: string;
  /** Indicador vivo mostrado na barra colapsada (dot, anel de progresso…). */
  indicator?: ReactNode;
  /** Conteúdo extra no header, entre o título e o chevron. */
  headerExtra?: ReactNode;
  children: ReactNode;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap font-code text-[9px] font-extrabold tracking-[0.14em] text-[var(--wb-text-dim)]">
      {children}
    </span>
  );
}

export function PanelShell({ id, side, title, indicator, headerExtra, children }: PanelShellProps) {
  const { effective, widthOf, toggle } = useWorkbenchPanelsContext();
  const open = effective[id];
  const width = widthOf(id);
  // Chevron do protótipo (◀/▶): aponta para onde o painel vai ao clicar.
  const chevron = (side === 'left') === open ? '◀' : '▶';

  return (
    <aside
      aria-label={title}
      className={cn(
        'flex flex-none flex-col overflow-hidden bg-[var(--wb-bg-panel)] transition-[width] duration-[220ms] ease-[ease]',
        side === 'left'
          ? 'border-r border-[var(--wb-border)]'
          : 'border-l border-[var(--wb-border)]',
      )}
      style={{ width }}
    >
      {open ? (
        <>
          <div className="flex flex-none items-center justify-between gap-2 px-2.5 pb-1.5 pt-2.5">
            <SectionLabel>{title}</SectionLabel>
            <div className="flex items-center gap-1.5">
              {headerExtra}
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Recolher painel ${title}`}
                className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[var(--wb-bg-inset)] text-[10px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
              >
                <span aria-hidden>{chevron}</span>
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-label={`Expandir painel ${title}`}
          className="flex flex-1 cursor-pointer flex-col items-center gap-2.5 py-2.5 text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
        >
          <span className="text-[10px]" aria-hidden>
            {chevron}
          </span>
          {indicator}
          <span
            className="font-code text-[9px] font-extrabold tracking-[0.14em]"
            style={{ writingMode: 'vertical-rl' }}
          >
            {title}
          </span>
        </button>
      )}
    </aside>
  );
}
