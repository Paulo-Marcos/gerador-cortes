import { describe, expect, it } from 'vitest';
import type { CenaRemotion } from '@/types/models';
import {
  areScenesOverlapping,
  calculateMaxSimultaneous,
  validateSceneOverlaps,
} from '../sceneValidation';

function makeScene(inicio: number, fim: number, texto = 'Cena'): CenaRemotion {
  return {
    tipo: 'barra_inferior',
    inicio,
    fim,
    texto,
  };
}

describe('sceneValidation', () => {
  describe('areScenesOverlapping', () => {
    it('deve retornar falso para cenas adjacentes ou sem colisao', () => {
      const a = makeScene(0, 5);
      const b = makeScene(5, 10);
      const c = makeScene(12, 15);
      expect(areScenesOverlapping(a, b)).toBe(false);
      expect(areScenesOverlapping(b, c)).toBe(false);
    });

    it('deve retornar verdadeiro para colisao parcial', () => {
      const a = makeScene(0, 5.1);
      const b = makeScene(5, 10);
      expect(areScenesOverlapping(a, b)).toBe(true);
    });

    it('deve retornar verdadeiro para colisao total (uma dentro da outra)', () => {
      const a = makeScene(0, 10);
      const b = makeScene(3, 7);
      expect(areScenesOverlapping(a, b)).toBe(true);
    });
  });

  describe('validateSceneOverlaps', () => {
    it('deve identificar indices corretos das cenas sobrepostas', () => {
      const cenas = [
        makeScene(0, 5, 'A'), // 0
        makeScene(4, 8, 'B'), // 1 (sobreposta com A)
        makeScene(10, 12, 'C'), // 2
        makeScene(11, 14, 'D'), // 3 (sobreposta com C)
      ];

      const result = validateSceneOverlaps(cenas);
      expect(result.overlappingIndices.has(0)).toBe(true);
      expect(result.overlappingIndices.has(1)).toBe(true);
      expect(result.overlappingIndices.has(2)).toBe(true);
      expect(result.overlappingIndices.has(3)).toBe(true);
    });

    it('deve retornar set vazio se nao houver colisoes', () => {
      const cenas = [makeScene(0, 5), makeScene(5, 10), makeScene(10, 15)];

      const result = validateSceneOverlaps(cenas);
      expect(result.overlappingIndices.size).toBe(0);
      expect(result.maxSimultaneous).toBe(1);
    });
  });

  describe('calculateMaxSimultaneous', () => {
    it('deve retornar 0 para array vazio', () => {
      expect(calculateMaxSimultaneous([])).toBe(0);
    });

    it('deve calcular densidade maxima com 3 sobrepostas', () => {
      const cenas = [makeScene(0, 10), makeScene(2, 6), makeScene(5, 8)];
      // Entre 5 e 6 todas as 3 estao ativas.
      expect(calculateMaxSimultaneous(cenas)).toBe(3);
    });

    it('deve lidar com limites estritos sem sobredimensionar', () => {
      const cenas = [makeScene(0, 5), makeScene(5, 10)];
      // Em 5s uma termina e outra comeca, max deve ser 1
      expect(calculateMaxSimultaneous(cenas)).toBe(1);
    });
  });
});
