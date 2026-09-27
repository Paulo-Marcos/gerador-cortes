/**
 * Constantes e helpers puros compartilhados entre o YoutubeLayoutPanel e seus
 * subcomponentes (E-006).
 */
import type { YoutubeLayoutMode } from '@/shared/palco/youtubeLayout';

export const MODE_LABEL: Record<YoutubeLayoutMode, string> = {
  full: 'Full',
  compartilhada: 'Compartilhada',
};

/** Rotulo curto para pilulas e chips, onde 'Compartilhada' nao cabe. */
export const MODE_SHORT: Record<YoutubeLayoutMode, string> = {
  full: 'FULL',
  compartilhada: 'COMP.',
};


export function round(value: number) {
  return Math.round(value * 10) / 10;
}
