import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// RetractableFooter — rodapé retrátil genérico dos painéis do
// Workbench (AUDITORIA-v2 §8/§9, CP9/CP10). Reaproveita o mesmo
// vocabulário visual do PanelShell (header clicável + chevron),
// só que na horizontal: um header fixo (ícone + label mono +
// chevron) que revela/esconde um corpo de ações pouco usadas.
// Fechado por padrão — o estado open/onToggle é sempre controlado
// pelo painel-pai (mesmo padrão de `ControlsPanel`/`collapsed`),
// para não duplicar um segundo sistema de colapso.
// ─────────────────────────────────────────────────────────────

interface Props {
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function RetractableFooter({ icon, label, open, onToggle, children }: Props) {
  return (
    <div className="flex flex-none flex-col border-t border-[var(--wb-border)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? `Recolher ${label}` : `Expandir ${label}`}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors hover:bg-[var(--wb-bg-inset)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        )}
      >
        <span className="flex-none text-[var(--wb-text-dim)]" aria-hidden>
          {icon}
        </span>
        <span className="flex-1 font-code text-[9px] font-extrabold tracking-[0.14em] text-[var(--wb-text-dim)]">
          {label}
        </span>
        <span className="flex-none text-[var(--wb-text-dim)]" aria-hidden>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && <div className="flex flex-col gap-1 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}
