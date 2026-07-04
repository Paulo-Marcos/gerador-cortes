import { describe, it, expect } from 'vitest';
import {
  findDesvioAtTime,
  sortDesviosCronologicamente,
  selectDesvioIdxByTime,
} from '../desvioUtils';
import type { Desvio } from '@/types/models';

const d = (inicio_hms: string, fim_hms: string, motivo = ''): Desvio => ({
  inicio_hms,
  fim_hms,
  motivo,
});

// ── findDesvioAtTime ──────────────────────────────────────────────────────────

describe('findDesvioAtTime', () => {
  const desvios = [d('00:00:10', '00:00:20'), d('00:00:30', '00:00:45')];

  it('retorna null quando lista vazia', () => {
    expect(findDesvioAtTime([], 15)).toBeNull();
  });

  it('retorna null quando tempo está fora de todos os desvios', () => {
    expect(findDesvioAtTime(desvios, 5)).toBeNull();
    expect(findDesvioAtTime(desvios, 25)).toBeNull();
    expect(findDesvioAtTime(desvios, 50)).toBeNull();
  });

  it('encontra desvio quando tempo está exatamente no início', () => {
    const result = findDesvioAtTime(desvios, 10);
    expect(result).not.toBeNull();
    expect(result!.desvio.inicio_hms).toBe('00:00:10');
    expect(result!.endSec).toBe(20);
  });

  it('encontra desvio quando tempo está no meio', () => {
    const result = findDesvioAtTime(desvios, 15);
    expect(result).not.toBeNull();
    expect(result!.desvio.inicio_hms).toBe('00:00:10');
  });

  it('não retorna desvio quando tempo está exatamente no fim (exclusivo)', () => {
    expect(findDesvioAtTime(desvios, 20)).toBeNull();
  });

  it('encontra o segundo desvio corretamente', () => {
    const result = findDesvioAtTime(desvios, 35);
    expect(result).not.toBeNull();
    expect(result!.desvio.inicio_hms).toBe('00:00:30');
    expect(result!.endSec).toBe(45);
  });
});

// ── sortDesviosCronologicamente ───────────────────────────────────────────────

describe('sortDesviosCronologicamente', () => {
  it('retorna array vazio inalterado', () => {
    expect(sortDesviosCronologicamente([])).toEqual([]);
  });

  it('não muta o array original', () => {
    const original = [d('00:01:00', '00:01:10'), d('00:00:05', '00:00:15')];
    const sorted = sortDesviosCronologicamente(original);
    expect(original[0].inicio_hms).toBe('00:01:00');
    expect(sorted[0].inicio_hms).toBe('00:00:05');
  });

  it('ordena array já desordenado corretamente', () => {
    const input = [d('00:01:30', '00:01:40'), d('00:00:05', '00:00:15'), d('00:00:45', '00:01:00')];
    const result = sortDesviosCronologicamente(input);
    expect(result[0].inicio_hms).toBe('00:00:05');
    expect(result[1].inicio_hms).toBe('00:00:45');
    expect(result[2].inicio_hms).toBe('00:01:30');
  });

  it('mantém array já ordenado', () => {
    const input = [d('00:00:05', '00:00:15'), d('00:00:45', '00:01:00')];
    const result = sortDesviosCronologicamente(input);
    expect(result[0].inicio_hms).toBe('00:00:05');
    expect(result[1].inicio_hms).toBe('00:00:45');
  });

  it('lida com tempos iguais no início sem erro', () => {
    const input = [d('00:00:10', '00:00:20'), d('00:00:10', '00:00:30')];
    const result = sortDesviosCronologicamente(input);
    expect(result).toHaveLength(2);
    expect(result[0].inicio_hms).toBe('00:00:10');
  });
});

// ── selectDesvioIdxByTime ─────────────────────────────────────────────────────

describe('selectDesvioIdxByTime', () => {
  const desvios = [
    d('00:00:10', '00:00:20'), // idx 0
    d('00:00:40', '00:00:50'), // idx 1
    d('00:01:10', '00:01:20'), // idx 2
  ];

  it('retorna -1 para array vazio', () => {
    expect(selectDesvioIdxByTime([], 30)).toBe(-1);
  });

  it('retorna o índice quando tempo está dentro de um desvio', () => {
    expect(selectDesvioIdxByTime(desvios, 15)).toBe(0);
    expect(selectDesvioIdxByTime(desvios, 45)).toBe(1);
    expect(selectDesvioIdxByTime(desvios, 75)).toBe(2);
  });

  it('retorna índice do desvio mais próximo quando fora de todos', () => {
    // tempo=5 → mais próximo de idx 0 (começa em 10)
    expect(selectDesvioIdxByTime(desvios, 5)).toBe(0);
    // tempo=55 → idx 1 (fim=50, dist=5) vs idx 2 (ini=70, dist=15) → idx 1
    expect(selectDesvioIdxByTime(desvios, 55)).toBe(1);
    // tempo=200 → mais próximo de idx 2 (fim=80)
    expect(selectDesvioIdxByTime(desvios, 200)).toBe(2);
  });

  it('retorna índice quando tempo está exatamente no início', () => {
    expect(selectDesvioIdxByTime(desvios, 10)).toBe(0);
  });

  it('retorna índice quando tempo está exatamente no fim', () => {
    expect(selectDesvioIdxByTime(desvios, 20)).toBe(0);
  });
});
