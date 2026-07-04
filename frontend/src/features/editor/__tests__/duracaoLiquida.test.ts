import { describe, expect, it } from 'vitest';
import { calcularDuracaoLiquida, calcularSegmentosLiquidos } from '../timeUtils';

/**
 * Testes do cálculo de duração líquida e segmentos mantidos no frontend.
 *
 * Esses helpers DEVEM produzir o mesmo resultado que o backend
 * (`app.domain.segment_calculator.calcular_segmentos`) — qualquer
 * divergência aparece como cronômetro/scrubber errado no Player da fase 2.
 */

function d(inicio: string, fim: string) {
  return { inicio_hms: inicio, fim_hms: fim };
}

describe('calcularSegmentosLiquidos', () => {
  it('sem desvios retorna o intervalo completo', () => {
    const segs = calcularSegmentosLiquidos(0, 100, []);
    expect(segs).toEqual([{ start: 0, end: 100 }]);
  });

  it('um desvio no meio divide em dois segmentos', () => {
    const segs = calcularSegmentosLiquidos(0, 100, [d('00:00:30', '00:00:40')]);
    expect(segs).toEqual([
      { start: 0, end: 30 },
      { start: 40, end: 100 },
    ]);
  });

  it('descarta segmentos menores que 0.1s (threshold defensivo)', () => {
    const segs = calcularSegmentosLiquidos(0, 100, [d('00:00:00.050', '00:00:10')]);
    // Não deve aparecer [0.0, 0.05]
    expect(segs.some((s) => s.start === 0 && s.end < 0.1)).toBe(false);
  });

  it('desvios desordenados são ordenados internamente', () => {
    const segs = calcularSegmentosLiquidos(0, 100, [
      d('00:00:50', '00:00:60'),
      d('00:00:20', '00:00:30'),
    ]);
    expect(segs[0]).toEqual({ start: 0, end: 20 });
    expect(segs[1]).toEqual({ start: 30, end: 50 });
    expect(segs[2]).toEqual({ start: 60, end: 100 });
  });
});

describe('calcularDuracaoLiquida — sobreposições', () => {
  it('REGRESSAO: dois desvios sobrepostos NAO descontam tempo em dobro', () => {
    // Desvios sobrepostos: [10, 30] e [20, 40].  Merge sequencial deve
    // remover o intervalo total [10, 40] = 30s.  Soma ingênua de overlaps
    // independentes removeria 20 + 20 = 40s — erro de 10s.
    const desvios = [d('00:00:10', '00:00:30'), d('00:00:20', '00:00:40')];
    const liquida = calcularDuracaoLiquida(0, 100, desvios);
    // 100 - (40 - 10) = 70s
    expect(liquida).toBeCloseTo(70, 1);
  });

  it('REGRESSAO: desvio totalmente CONTIDO em outro não duplica desconto', () => {
    // [10, 50] contém [20, 30]. Tempo removido total: 40s.
    // Soma ingênua: 40 + 10 = 50s — erro de 10s.
    const desvios = [d('00:00:10', '00:00:50'), d('00:00:20', '00:00:30')];
    const liquida = calcularDuracaoLiquida(0, 100, desvios);
    expect(liquida).toBeCloseTo(60, 1);
  });

  it('três desvios concêntricos cobrem o mesmo bloco — desconto único', () => {
    // [10, 100], [20, 80], [30, 50] — todos dentro do primeiro.
    // Total removido: 90s.  Soma ingênua: 90 + 60 + 20 = 170s.
    const desvios = [
      d('00:00:10', '00:01:40'),
      d('00:00:20', '00:01:20'),
      d('00:00:30', '00:00:50'),
    ];
    const liquida = calcularDuracaoLiquida(0, 200, desvios);
    expect(liquida).toBeCloseTo(110, 1);
  });
});

describe('calcularDuracaoLiquida — cenário real do bug', () => {
  it('reproduz o corte 480e2023 com 8 desvios sobrepostos: dur. líquida = soma dos segmentos mantidos', () => {
    // Subconjunto do corte real (range 1751-1818) onde o bug original
    // descontou em dobro silêncios sobrepostos com um [REPETICAO] grande.
    const inicio = 1751;
    const fim = 1818;
    const desvios = [
      d('00:29:11.000', '00:29:27.980'), // 1751 -> 1767.98 — silêncio 16.98s
      d('00:29:27.780', '00:30:15.980'), // 1767.78 -> 1815.98 — REPETICAO 48.2s
      d('00:29:29.940', '00:29:42.990'), // dentro do REPETICAO
      d('00:29:44.200', '00:29:46.010'),
      d('00:29:47.140', '00:29:49.170'),
      d('00:29:56.060', '00:30:08.880'),
      d('00:30:10.160', '00:30:12.280'),
      d('00:30:13.330', '00:30:17.970'), // cruza o fim do REPETICAO
    ];

    const segs = calcularSegmentosLiquidos(inicio, fim, desvios);
    const liquida = calcularDuracaoLiquida(inicio, fim, desvios);

    // O range tem 67s. Os desvios cobrem ~66s (de 1751 até 1817.97).
    // Deve sobrar ~0.03s, que é descartado pelo threshold de 0.1s →
    // fallback retorna o range completo se nada sobra significativo.
    // O importante: liquida === soma dos segmentos retornados (paridade
    // com o algoritmo do backend, sem dupla contagem).
    const somaSegs = segs.reduce((s, sg) => s + (sg.end - sg.start), 0);
    expect(liquida).toBeCloseTo(somaSegs, 2);
  });
});

describe('calcularDuracaoLiquida — invariantes', () => {
  it('nunca é negativa', () => {
    expect(calcularDuracaoLiquida(0, 10, [d('00:00:00', '00:01:00')])).toBeGreaterThanOrEqual(0);
  });

  it('nunca excede a duração nominal', () => {
    const desvios = [d('00:00:30', '00:00:40'), d('00:00:50', '00:00:60')];
    const liquida = calcularDuracaoLiquida(0, 100, desvios);
    expect(liquida).toBeLessThanOrEqual(100);
  });

  it('sem desvios é exatamente fim - inicio', () => {
    expect(calcularDuracaoLiquida(835.516, 1911.818, [])).toBeCloseTo(1911.818 - 835.516, 3);
  });

  it('soma dos segmentos sempre = duração líquida', () => {
    const desvios = [
      d('00:00:10', '00:00:20'),
      d('00:00:15', '00:00:25'),
      d('00:00:50', '00:00:80'),
    ];
    const segs = calcularSegmentosLiquidos(0, 200, desvios);
    const soma = segs.reduce((s, sg) => s + (sg.end - sg.start), 0);
    const liquida = calcularDuracaoLiquida(0, 200, desvios);
    expect(soma).toBeCloseTo(liquida, 3);
  });
});
