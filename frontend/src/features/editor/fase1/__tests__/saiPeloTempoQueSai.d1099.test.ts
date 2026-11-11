import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { resumirCorte } from '@/upgrade/trilhaDaLive';
import { descreverOBruto } from '../descreverOBruto';

// D-1099, rodada 2 da auditoria do #368: "há trecho que sai" se decide pelo tempo
// que sai (com folga de milissegundo), não comparando o bruto e o fica já cortados.
// O fica passa pelo round3 das pontas e o bruto não: comparar os dois andares
// inventava um "sai" sem trecho e ainda escondia o trecho que a fração absorvia.

const DE_40_MS: Desvio[] = [{ inicio_hms: '00:00:50.000', fim_hms: '00:00:50.040', motivo: '' }];

describe('D-1099 · o sai vem do tempo que sai', () => {
  it('sem trecho, nada sai, também com a ponta que o backend dá a 1 ulp do milissegundo', () => {
    // hms_to_seg("00:05:43.410") do backend devolve 343.40999999999997.
    const semTrecho = { inicio_seg: 343.40999999999997, fim_seg: 552.41, desvios: [] };
    expect(resumirCorte(semTrecho, undefined).cortes).toMatch(/· nada sai$/);
    expect(descreverOBruto(semTrecho, 0).sai).toBe('nada sai');
  });

  it('o trecho de 40 ms também aparece quando a fração do bruto o absorve', () => {
    const corte = { inicio_seg: 0, fim_seg: 100.5, desvios: DE_40_MS };
    expect(resumirCorte(corte, undefined).cortes).toBe('fica 1:40 · sai 0:01');
    expect(descreverOBruto(corte, 0).sai).toBe('sai 0:01 em 1 trecho');
  });
});
