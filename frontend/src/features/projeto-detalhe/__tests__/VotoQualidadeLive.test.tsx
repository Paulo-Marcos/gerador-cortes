import { describe, expect, it } from 'vitest';
import { compararVotoComRanking } from '../VotoQualidadeLive';

describe('compararVotoComRanking (D-372)', () => {
  it('sem voto ainda, nao ha comparativo', () => {
    expect(compararVotoComRanking(null, 72)).toBeNull();
  });

  it('sem pontuacao de ranking (projeto legado), nao ha comparativo', () => {
    expect(compararVotoComRanking(4, 0)).toBeNull();
  });

  it('voto bem acima da nota do ranking (diff > 15) supera', () => {
    // voto 5 -> 100; ranking 60 -> diff 40
    expect(compararVotoComRanking(5, 60)?.variant).toBe('success');
  });

  it('voto bem abaixo da nota do ranking (diff < -15) fica aquem', () => {
    // voto 1 -> 20; ranking 60 -> diff -40
    expect(compararVotoComRanking(1, 60)?.variant).toBe('warning');
  });

  it('voto proximo da nota do ranking bate a expectativa', () => {
    // voto 3 -> 60; ranking 65 -> diff -5
    expect(compararVotoComRanking(3, 65)?.variant).toBe('default');
  });
});
