import { Brain, Download, Rocket, Scissors, Tags, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PipelineStepState = 'done' | 'active' | 'todo';

export interface PipelineStep {
  key: string;
  label: string;
  shortLabel?: string;
  hint?: string;
  Icon: LucideIcon;
  state: PipelineStepState;
}

export const PIPELINE_STAGE_META = [
  { key: 'ingestao', label: 'Ingestao', shortLabel: 'Ingest', Icon: Download },
  { key: 'analise', label: 'Analise', shortLabel: 'Analise', Icon: Brain },
  { key: 'edicao', label: 'Edicao', shortLabel: 'Edicao', Icon: Scissors },
  { key: 'metadados', label: 'Metadados', shortLabel: 'Meta', Icon: Tags },
  { key: 'publicacao', label: 'Publicacao', shortLabel: 'Upload', Icon: Rocket },
] as const;

// Estados dos ícones de etapa (AUDITORIA-IMPLEMENTACAO §1.1): feito em
// ok-soft/ok; ativo em cor cheia com glow; pendente em inset esmaecido.
const stateClass: Record<PipelineStepState, string> = {
  done: 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]',
  active: 'bg-[var(--wb-accent)] text-[var(--wb-accent-fg)] shadow-[0_0_6px_var(--wb-accent)]',
  todo: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] opacity-55',
};

export function Pipeline({ steps, compact = false }: { steps: PipelineStep[]; compact?: boolean }) {
  return (
    <div
      className={cn('flex w-full items-center', compact ? 'gap-1' : 'gap-1.5')}
      role="list"
      aria-label="Progresso do pipeline"
    >
      {steps.map((step) => {
        const Icon = step.Icon;
        return (
          <span
            key={step.key}
            role="listitem"
            aria-label={`${step.label}: ${step.state}`}
            title={step.hint ? `${step.label} — ${step.hint}` : step.label}
            className={cn(
              'flex flex-none items-center justify-center rounded-full transition-all',
              compact ? 'h-[21px] w-[21px]' : 'h-6 w-6',
              stateClass[step.state],
            )}
          >
            <Icon size={compact ? 12 : 13} strokeWidth={2.2} aria-hidden />
          </span>
        );
      })}
    </div>
  );
}
