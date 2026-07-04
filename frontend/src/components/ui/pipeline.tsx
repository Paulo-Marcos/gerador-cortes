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

const stateClass: Record<PipelineStepState, string> = {
  done: 'border-[var(--wb-ink)] bg-[var(--wb-ink)] text-[var(--wb-ink-fg)]',
  active:
    'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-white shadow-[0_0_0_4px_var(--wb-accent-soft)]',
  todo: 'border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text-dim)]',
};

export function Pipeline({ steps, compact = false }: { steps: PipelineStep[]; compact?: boolean }) {
  return (
    <div className="flex w-full items-center" role="list" aria-label="Progresso do pipeline">
      {steps.map((step, index) => {
        const Icon = step.Icon;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.key} className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}>
            <div
              role="listitem"
              aria-label={`${step.label}: ${step.state}`}
              title={step.hint ?? step.label}
              className="flex min-w-0 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-full border transition-all',
                  compact ? 'h-5 w-5' : step.state === 'active' ? 'h-7 w-7' : 'h-6 w-6',
                  stateClass[step.state],
                )}
              >
                <Icon size={compact ? 10 : 13} strokeWidth={2.2} aria-hidden />
              </span>
              {!compact && (
                <span className="max-w-20 truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--wb-text-dim)]">
                  {step.shortLabel ?? step.label}
                </span>
              )}
            </div>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  'mx-1 h-px min-w-4 flex-1',
                  step.state === 'done' ? 'bg-[var(--wb-ink)]' : 'bg-[var(--wb-border)]',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
