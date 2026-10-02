import type { StatusExportCorte } from '@/types/models';
import type { IconName } from '@/upgrade/Icon';

interface PillSpec {
  emoji: string;
  icone: IconName;
  label: string;
  done: boolean;
  hint: string;
}

// D-746: a ordem é a do fluxo — Thumb e Meta são pré-requisitos do YouTube.
// Com o YouTube antes delas, um corte renderizado e sem capa apontava
// "YouTube" como próxima etapa, uma instrução errada.
export function buildStatusPills(corte: StatusExportCorte): PillSpec[] {
  return [
    {
      emoji: '🎞️',
      label: 'Bruto',
      icone: 'scissors',
      done: corte.raw_pronto,
      hint: 'Recorte bruto exportado',
    },
    {
      emoji: '🎭',
      label: 'Cenas',
      icone: 'clapperboard',
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
      icone: 'palette',
      done: corte.grade_pronta,
      hint: 'Fase 1 do render final concluida (clip_graded.mp4)',
    },
    {
      emoji: '✨',
      label: 'Overlays',
      icone: 'sparkles',
      done: Boolean(corte.overlays_prontos),
      hint: 'Fase 2 do render final concluida (overlays Remotion)',
    },
    {
      emoji: '🎬',
      label: 'Final',
      icone: 'film',
      done: corte.video_pronto,
      hint: 'Render final completo (upload_ready/video.mp4)',
    },
    {
      emoji: '🖼️',
      label: 'Thumb',
      icone: 'image',
      done: corte.thumbnail_pronta,
      hint: 'Thumbnail gerada',
    },
    {
      emoji: '📝',
      label: 'Meta',
      icone: 'tags',
      done: corte.metadados_completos,
      hint: 'Metadados (titulo, descricao, tags) completos',
    },
    {
      emoji: '📺',
      label: 'YouTube',
      icone: 'youtube',
      done: Boolean(corte.youtube_url_publicado),
      hint: corte.youtube_url_publicado
        ? 'Publicado no YouTube'
        : corte.youtube_scheduled_at
          ? 'Agendado no YouTube'
          : 'Ainda nao publicado',
    },
  ];
}
