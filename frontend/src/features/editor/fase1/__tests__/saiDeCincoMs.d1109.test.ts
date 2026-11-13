import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { resumirCorte } from '@/upgrade/trilhaDaLive';
import { descreverOBruto } from '../descreverOBruto';

// D-1109 (C1 da rodada 2 da auditoria do #368): a folga do "há trecho que sai" é
// de 1 ms (medirFicaESai). O trecho de 40 ms da D-1099 não separa essa folga de
// uma de 10 ms; o de 5 ms separa. Com a folga maior, todo trecho de 2 a 9 ms
// sumia do resumo da etapa e da faixa "O bruto vai ter".

const DE_5_MS: Desvio[] = [{ inicio_hms: '00:00:50.000', fim_hms: '00:00:50.005', motivo: '' }];
const CORTE = { inicio_seg: 0, fim_seg: 100, desvios: DE_5_MS };

describe('D-1109 · trecho de 5 ms ainda sai', () => {
  it('o resumo da etapa Cortes diz sai 0:01', () => {
    expect(resumirCorte(CORTE, undefined).cortes).toBe('fica 1:39 · sai 0:01');
  });

  it('a faixa O bruto vai ter diz o mesmo', () => {
    const faixa = descreverOBruto(CORTE, 0);
    expect([faixa.fica, faixa.bruto, faixa.sai]).toEqual(['1:39', '1:40', 'sai 0:01 em 1 trecho']);
  });
});
