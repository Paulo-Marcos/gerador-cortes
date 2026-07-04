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
