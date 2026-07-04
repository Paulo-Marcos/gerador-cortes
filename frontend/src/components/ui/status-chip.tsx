import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CircleDashed,
  Download,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusProjeto } from '@/types/models';

export type StatusTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'error';

interface StatusMeta {
  label: string;
  Icon: LucideIcon;
  tone: StatusTone;
  animate?: boolean;
}

export const PROJECT_STATUS_META: Record<StatusProjeto, StatusMeta> = {
  pendente: { label: 'Aguardando', Icon: CircleDashed, tone: 'neutral' },
  baixando: { label: 'Baixando', Icon: Download, tone: 'warning', animate: true },
  transcrevendo: { label: 'Transcrevendo', Icon: Loader2, tone: 'info', animate: true },
  pronto: { label: 'Pronto p/ analisar', Icon: CheckCircle2, tone: 'info' },
  analisando: { label: 'Analisando', Icon: Brain, tone: 'accent', animate: true },
  analisado: { label: 'Analisado', Icon: CheckCircle2, tone: 'success' },
  erro: { label: 'Erro', Icon: AlertTriangle, tone: 'error' },
};

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-[var(--wb-border-soft)] bg-[var(--wb-pill-bg)] text-[var(--wb-text-mute)]',
  info: 'border-info/25 bg-[var(--wb-pill-bg)] text-info',
  accent: 'border-[var(--wb-accent)]/25 bg-[var(--wb-pill-bg)] text-[var(--wb-accent-strong)]',
  success: 'border-success/25 bg-[var(--wb-pill-bg)] text-success',
  warning: 'border-warning/25 bg-[var(--wb-pill-bg)] text-warning',
  error: 'border-error/25 bg-[var(--wb-pill-bg)] text-error',
};

export function StatusChip({
  status,
  label,
  tone,
  className,
}: {
  status?: StatusProjeto;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const meta = status ? PROJECT_STATUS_META[status] : null;
  const Icon = meta?.Icon ?? CircleDashed;
  const resolvedTone = tone ?? meta?.tone ?? 'neutral';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.04em] backdrop-blur',
        toneClasses[resolvedTone],
        className,
      )}
    >
      <Icon size={13} aria-hidden className={cn(meta?.animate && 'animate-spin')} />
      {label ?? meta?.label ?? 'Status'}
    </span>
  );
}
