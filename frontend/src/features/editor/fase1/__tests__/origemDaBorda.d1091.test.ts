import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { bordaAjustadaPorVoce, classificarTrechos } from '../origemDaBorda';

// D-1091: a linha do tempo distingue de quem é a borda do trecho que sai e o
// trecho que conta uma vez por estar dentro de outro.

const trecho = (inicio: string, fim: string, extra: Partial<Desvio> = {}): Desvio => ({
  inicio_hms: inicio,
  fim_hms: fim,
  motivo: 'x',
  origem: 'claude',
  ...extra,
});

describe('bordaAjustadaPorVoce — a origem sai do carimbo da rodada (riscados.py)', () => {
  it('com as bordas que a rodada deu, a borda é da IA', () => {
    const intacto = trecho('00:05:05.000', '00:05:22.000', { rodada: 2, borda_da_rodada: [305, 322] });
    expect(bordaAjustadaPorVoce(intacto)).toBe(false);
  });

  it('dentro da folga de 2 ms, ainda é da IA, como no backend', () => {
    const arredondado = trecho('00:05:05.001', '00:05:22.000', { rodada: 2, borda_da_rodada: [305, 322] });
    expect(bordaAjustadaPorVoce(arredondado)).toBe(false);
  });

  it('com uma das bordas mexida, é sua', () => {
    const mexidoNoFim = trecho('00:05:05.000', '00:05:24.500', { rodada: 2, borda_da_rodada: [305, 322] });
    const mexidoNoInicio = trecho('00:05:03.000', '00:05:22.000', { rodada: 2, borda_da_rodada: [305, 322] });
    expect(bordaAjustadaPorVoce(mexidoNoFim)).toBe(true);
    expect(bordaAjustadaPorVoce(mexidoNoInicio)).toBe(true);
  });

  it('sem carimbo, só o trecho marcado à mão é seu', () => {
    expect(bordaAjustadaPorVoce(trecho('00:01:00', '00:01:10', { origem: 'manual' }))).toBe(true);
    expect(bordaAjustadaPorVoce(trecho('00:01:00', '00:01:10', { origem: 'claude' }))).toBe(false);
    expect(bordaAjustadaPorVoce(trecho('00:01:00', '00:01:10', { origem: undefined }))).toBe(false);
  });
});

describe('classificarTrechos — os três casos do que sai', () => {
  it('o trecho inteiro dentro de outro conta uma vez; o de fora segue pela borda', () => {
    const fora = trecho('00:16:45', '00:18:41');
    const dentro = trecho('00:17:35', '00:18:34', { origem: 'manual' });
    const ajustado = trecho('00:18:41', '00:18:56', { origem: 'manual' });
    expect(classificarTrechos([fora, dentro, ajustado])).toEqual(['ia', 'dentro', 'voce']);
  });

  it('sobreposição parcial não é "dentro": os dois aparecem pela borda', () => {
    expect(classificarTrechos([trecho('00:00:10', '00:00:20'), trecho('00:00:15', '00:00:25')])).toEqual([
      'ia',
      'ia',
    ]);
  });

  it('dois trechos iguais: o primeiro conta e o segundo fica dentro', () => {
    expect(classificarTrechos([trecho('00:00:10', '00:00:20'), trecho('00:00:10', '00:00:20')])).toEqual([
      'ia',
      'dentro',
    ]);
  });

  it('o de dentro pode vir antes na lista', () => {
    expect(classificarTrechos([trecho('00:00:12', '00:00:14'), trecho('00:00:10', '00:00:20')])).toEqual([
      'dentro',
      'ia',
    ]);
  });
});
