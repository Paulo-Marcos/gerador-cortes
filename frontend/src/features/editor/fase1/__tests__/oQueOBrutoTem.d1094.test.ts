import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { resumirCorte } from '@/upgrade/trilhaDaLive';
import { classificarTrechos } from '../origemDaBorda';
import { oQueOBrutoTem } from '../oQueOBrutoTem';

// D-1094 (E4 da D-1082): a faixa "O bruto vai ter" — fica, sai e sincronia.

const trecho = (inicio_hms: string, fim_hms: string): Desvio => ({ inicio_hms, fim_hms, motivo: '' });

// O exemplo do board: bruto de 20:11, saem 1:00 + 1:28, e o terceiro cabe no segundo.
const DO_BOARD: Desvio[] = [
  trecho('00:01:00.000', '00:02:00.000'),
  trecho('00:10:00.000', '00:11:28.000'),
  trecho('00:10:30.000', '00:11:00.000'),
];

const faixa = (inicio_seg: number, fim_seg: number, desvios: Desvio[], ms = 0) =>
  oQueOBrutoTem({ inicio_seg, fim_seg, desvios }, ms);

describe('D-1094 · o que o bruto vai ter', () => {
  it('o exemplo do board: fica 17:43 de 20:11 e sai 2:28 em 3 trechos (1 dentro de outro)', () => {
    expect(faixa(0, 1211, DO_BOARD)).toEqual({
      fica: '17:43',
      bruto: '20:11',
      sai: 'sai 2:28 em 3 trechos (1 dentro de outro)',
      sincronia: 'sincronia do áudio 0 ms',
    });
  });

  it('o trecho dentro de outro conta uma vez no tempo que sai', () => {
    const semODeDentro = faixa(0, 1211, DO_BOARD.slice(0, 2));
    expect(faixa(0, 1211, DO_BOARD).fica).toBe(semODeDentro.fica);
    expect(semODeDentro.sai).toBe('sai 2:28 em 2 trechos');
  });

  it('o "dentro de outro" é a classe da linha do tempo (D-1091)', () => {
    // Dois iguais: a linha do tempo põe o segundo como "dentro", a faixa também.
    const iguais = [trecho('00:01:00.000', '00:02:00.000'), trecho('00:01:00.000', '00:02:00.000')];
    expect(classificarTrechos(iguais).filter((c) => c === 'dentro')).toHaveLength(1);
    expect(faixa(0, 600, iguais).sai).toBe('sai 1:00 em 2 trechos (1 dentro de outro)');
  });

  it('mais de um dentro de outro vai no plural', () => {
    const desvios = [...DO_BOARD, trecho('00:01:10.000', '00:01:20.000')];
    expect(faixa(0, 1211, desvios).sai).toBe('sai 2:28 em 4 trechos (2 dentro de outros)');
  });

  it('um trecho só, no singular', () => {
    expect(faixa(0, 600, [trecho('00:01:00.000', '00:01:30.000')]).sai).toBe('sai 0:30 em 1 trecho');
  });

  it('sem trecho, ou com trecho fora do corte, nada sai', () => {
    expect(faixa(100, 190, []).sai).toBe('nada sai');
    expect(faixa(0, 100, [trecho('00:10:00.000', '00:10:30.000')]).sai).toBe('nada sai');
  });

  it.each([
    ['o exemplo do board', 0, 1211, DO_BOARD],
    ['líquida fracionária', 0, 1211, [trecho('00:01:00.000', '00:02:00.000'), trecho('00:10:00.000', '00:11:28.400')]],
    ['bruto fracionário', 0.4, 1211.9, [trecho('00:05:00.250', '00:06:10.900')]],
    ['trecho de 0,3 s', 0, 100, [trecho('00:00:10.000', '00:00:10.300')]],
    ['sem trecho', 0, 100, []],
  ] as const)('%s: o fica e o sai são os do resumo da etapa (D-1090)', (_, ini, fim, desvios) => {
    const resumo = resumirCorte({ inicio_seg: ini, fim_seg: fim, desvios: [...desvios] }, undefined).cortes!;
    const { fica, sai } = faixa(ini, fim, [...desvios]);
    const saiNoResumo = sai === 'nada sai' ? 'nada sai' : sai.split(' em ')[0];
    expect(resumo).toBe(`fica ${fica} · ${saiNoResumo}`);
  });

  it.each([
    [0, 'sincronia do áudio 0 ms'],
    [40, 'sincronia do áudio +40 ms'],
    [-120, 'sincronia do áudio -120 ms'],
  ])('a sincronia de %i ms leva o sinal da Sincronia do áudio', (ms, texto) => {
    expect(faixa(0, 60, [], ms).sincronia).toBe(texto);
  });
});
