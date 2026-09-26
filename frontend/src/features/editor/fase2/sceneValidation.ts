import type { CenaRemotion } from '@/types/models';

export interface SceneValidationResult {
  overlappingIndices: Set<number>;
  maxSimultaneous: number;
}

/**
 * Checks if two scenes overlap in time.
 */
export function areScenesOverlapping(a: CenaRemotion, b: CenaRemotion): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/**
 * Validates a list of sorted scenes for overlaps and computes the maximum simultaneous scene count.
 */
export function validateSceneOverlaps(sortedScenes: CenaRemotion[]): SceneValidationResult {
  const overlappingIndices = new Set<number>();
  const n = sortedScenes.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (areScenesOverlapping(sortedScenes[i], sortedScenes[j])) {
        overlappingIndices.add(i);
        overlappingIndices.add(j);
      }
    }
  }

  return {
    overlappingIndices,
    maxSimultaneous: calculateMaxSimultaneous(sortedScenes),
  };
}

interface TimelineEvent {
  time: number;
  type: 'start' | 'end';
}

/**
 * Calculates the maximum number of active scenes at any point in time.
 */
export function calculateMaxSimultaneous(scenes: CenaRemotion[]): number {
  if (scenes.length === 0) return 0;

  const events: TimelineEvent[] = [];
  for (const scene of scenes) {
    events.push({ time: scene.inicio, type: 'start' });
    events.push({ time: scene.fim, type: 'end' });
  }

  // Sort events. If times are equal, end events must be processed before start events
  events.sort((a, b) => {
    if (Math.abs(a.time - b.time) < 0.001) {
      return a.type === 'end' ? -1 : 1;
    }
    return a.time - b.time;
  });

  let current = 0;
  let max = 0;

  for (const event of events) {
    current += event.type === 'start' ? 1 : -1;
    if (current > max) {
      max = current;
    }
  }

  return max;
}

/**
 * Tolerancia para a cena estourar o fim do corte sem que isso seja defeito: a
 * ultima cena ganha duracao fixa e pode passar do ultimo segmento de fala.
 * Espelha `TOLERANCIA_FIM_CENA_SEG` do backend (`app/domain/corte/corte_mapper.py`).
 */
export const TOLERANCIA_FIM_CENA_SEG = 15;

export interface CenaForaDoCorte {
  indice: number;
  inicio: number;
  fim: number;
}

/**
 * Cenas cujo tempo nao cabe na duracao do corte.
 *
 * O sintoma classico e a cena gravada com o tempo ABSOLUTO da live convivendo
 * com cenas relativas — a timeline faz `max(duracao, maiorFimDeCena)` e ESTICA
 * para acomodar a invalida, exibindo um total muito maior que o video, que roda
 * vazio depois do fim real. Sem uma `duracao` positiva nao ha como julgar, e a
 * funcao nunca acusa por falta de referencia.
 */
export function cenasForaDoCorte(cenas: CenaRemotion[], duracaoSeg: number): CenaForaDoCorte[] {
  if (!(duracaoSeg > 0)) return [];

  const fora: CenaForaDoCorte[] = [];
  cenas.forEach((cena, indice) => {
    if (cena.inicio >= duracaoSeg || cena.fim > duracaoSeg + TOLERANCIA_FIM_CENA_SEG) {
      fora.push({ indice, inicio: cena.inicio, fim: cena.fim });
    }
  });
  return fora;
}
