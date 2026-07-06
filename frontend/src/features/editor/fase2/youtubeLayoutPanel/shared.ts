/**
 * Constantes e helpers puros compartilhados entre o YoutubeLayoutPanel e seus
 * subcomponentes (E-006).
 */
import type { YoutubeLayoutMode } from '../youtubeLayout';

export const MODE_LABEL: Record<YoutubeLayoutMode, string> = {
  full: 'Full',
  compartilhada: 'Compartilhada',
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number) {
  return Math.round(value * 10) / 10;
}
