import { Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Banner celebrativo no topo do card quando todos os cortes foram publicados.
 * Usa emoji estratégico (🎉) + ícone Lucide consistente.
 */
export function ReadyForYoutubeBadge({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Pronto para o YouTube"
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-t-[var(--radius)] px-3 py-1.5',
        'bg-gradient-to-r from-accent-600/30 via-accent-500/40 to-accent-600/30',
        'border-b border-accent-500/40 text-[11px] font-semibold uppercase tracking-wider',
        'text-accent-200',
        className,
      )}
    >
      <Youtube size={13} aria-hidden />
      <span>Pronto pro YouTube</span>
      <span aria-hidden>🎉</span>
    </div>
  );
}
