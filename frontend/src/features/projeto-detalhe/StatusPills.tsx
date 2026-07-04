import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { StatusExportCorte } from '@/types/models';

interface PillSpec {
  emoji: string;
  label: string;
  done: boolean;
  hint: string;
}

export function buildStatusPills(corte: StatusExportCorte): PillSpec[] {
  return [
    {
      emoji: '🎞️',
      label: 'Bruto',
      done: corte.raw_pronto,
      hint: 'Recorte bruto exportado',
    },
    {
      emoji: '🎭',
      label: 'Cenas',
      done: Boolean(corte.cenas_validadas),
      hint: corte.cenas_validadas
        ? 'Cenas Remotion validadas pelo editor'
        : corte.cenas_geradas
          ? 'Cenas geradas, aguardando validacao'
          : 'Sem cenas Remotion ainda',
    },
    {
      emoji: '🎨',
      label: 'Graded',
      done: corte.grade_pronta,
      hint: 'Fase 1 do render final concluida (clip_graded.mp4)',
    },
    {
      emoji: '✨',
      label: 'Overlays',
      done: Boolean(corte.overlays_prontos),
      hint: 'Fase 2 do render final concluida (overlays Remotion)',
    },
    {
      emoji: '🎬',
      label: 'Final',
      done: corte.video_pronto,
      hint: 'Render final completo (upload_ready/video.mp4)',
    },
    {
      emoji: '📺',
      label: 'YouTube',
      done: Boolean(corte.youtube_url_publicado),
      hint: corte.youtube_url_publicado
        ? 'Publicado no YouTube'
        : corte.youtube_scheduled_at
          ? 'Agendado no YouTube'
          : 'Ainda nao publicado',
    },
    {
      emoji: '🖼️',
      label: 'Thumb',
      done: corte.thumbnail_pronta,
      hint: 'Thumbnail gerada',
    },
    {
      emoji: '📝',
      label: 'Meta',
      done: corte.metadados_completos,
      hint: 'Metadados (titulo, descricao, tags) completos',
    },
  ];
}

/**
 * Pills compactos para mostrar progresso por corte:
 * Bruto -> Cenas -> Graded -> Overlays -> Final -> YouTube -> Thumb -> Meta.
 *
 * Ordem cronologica do pipeline: cenas validadas, depois o render final em
 * tres fases (graded, overlays, composicao final), depois publicacao no
 * YouTube. Thumb e Meta sao requisitos paralelos para a publicacao.
 */
export function StatusPills({ corte }: { corte: StatusExportCorte }) {
  const pills = buildStatusPills(corte);

  return (
    <div className="flex flex-wrap items-center gap-1" role="list" aria-label="Status do corte">
      {pills.map((p) => (
        <Tooltip
          key={p.label}
          label={
            <span className="flex flex-col gap-0.5">
              <strong className="font-medium">
                {p.emoji} {p.label}
              </strong>
              <span className="text-text-300">
                {p.done ? '✅ ' : '⬜ '}
                {p.hint}
              </span>
            </span>
          }
          side="top"
        >
          <div
            role="listitem"
            data-testid={`status-pill-${p.label.toLowerCase()}`}
            data-done={p.done ? 'true' : 'false'}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              p.done
                ? 'border-accent-500/40 bg-accent-500/15 text-accent-300'
                : 'border-[var(--border)] bg-bg-800/60 text-text-500',
            )}
          >
            <span aria-hidden className={cn(!p.done && 'grayscale opacity-50')}>
              {p.emoji}
            </span>
            <span>{p.label}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
