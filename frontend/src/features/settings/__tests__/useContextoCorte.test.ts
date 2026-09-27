import { describe, expect, it } from 'vitest';
import { normalizarContextoCorte } from '../useContextoCorte';

describe('normalizarContextoCorte', () => {
  it('usa os valores historicos quando o ajuste ainda nao chegou', () => {
    expect(normalizarContextoCorte(undefined, undefined)).toEqual({
      antesSeg: 60,
      depoisSeg: 300,
    });
  });

  it('clampa cada lado no proprio teto do backend', () => {
    expect(normalizarContextoCorte(9999, 9999)).toEqual({ antesSeg: 600, depoisSeg: 1800 });
  });

  it('trata negativo como respiro desligado, nao como default', () => {
    expect(normalizarContextoCorte(-30, -30)).toEqual({ antesSeg: 0, depoisSeg: 0 });
  });

  it('cai no default quando o valor e ilegivel', () => {
    expect(normalizarContextoCorte(Number.NaN, null)).toEqual({ antesSeg: 60, depoisSeg: 300 });
  });
});
