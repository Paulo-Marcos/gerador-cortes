import { hmsParaSeg } from '../timeUtils';
import type { Desvio } from '@/types/models';

/** Retorna o tempo de fim do desvio se `time` cair dentro dele, ou `null` caso contrário. */
export function findDesvioAtTime(
  desvios: Desvio[],
  time: number,
): { desvio: Desvio; endSec: number } | null {
  for (const d of desvios) {
    const start = hmsParaSeg(d.inicio_hms);
    const end = hmsParaSeg(d.fim_hms);
    if (time >= start && time < end) {
      return { desvio: d, endSec: end };
    }
  }
  return null;
}

/** Ordena desvios por tempo de início (não muta o array original). */
export function sortDesviosCronologicamente(desvios: Desvio[]): Desvio[] {
  return [...desvios].sort((a, b) => hmsParaSeg(a.inicio_hms) - hmsParaSeg(b.inicio_hms));
}

/** Retorna o índice (no array original) do desvio mais próximo ao `time` clicado.
 *  Prefere um desvio que contenha o tempo; caso contrário, o de menor distância. */
export function selectDesvioIdxByTime(desvios: Desvio[], time: number): number {
  if (desvios.length === 0) return -1;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < desvios.length; i++) {
    const s = hmsParaSeg(desvios[i].inicio_hms);
    const e = hmsParaSeg(desvios[i].fim_hms);
    if (time >= s && time <= e) return i;
    const dist = Math.min(Math.abs(time - s), Math.abs(time - e));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
