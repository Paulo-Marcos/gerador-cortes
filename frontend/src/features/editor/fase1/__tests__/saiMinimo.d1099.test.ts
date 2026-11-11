import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { resumirCorte } from '@/upgrade/trilhaDaLive';
import { descreverOBruto } from '../descreverOBruto';

// D-1099: trecho de menos de 0,05 s ainda sai, e o mínimo é 0:01 (regra da D-1090).
// O fica corta a fração (1:39 de 99,96 s); sem o piso, o bruto de 1:40 perdia um
// segundo sem que nada saísse. A conta é uma só (medirFicaESai), então o resumo
// da etapa e a faixa "O bruto vai ter" têm de dizer o mesmo.

const trecho = (inicio_hms: string, fim_hms: string): Desvio => ({ inicio_hms, fim_hms, motivo: '' });

const DE_40_MS = [trecho('00:00:50.000', '00:00:50.040')];

describe('D-1099 · trecho de menos de 0,05 s', () => {
  it('o resumo da etapa Cortes diz sai 0:01', () => {
    expect(resumirCorte({ inicio_seg: 0, fim_seg: 100, desvios: DE_40_MS }, undefined).cortes).toBe(
      'fica 1:39 · sai 0:01',
    );
  });

  it('a faixa O bruto vai ter diz o mesmo', () => {
    const faixa = descreverOBruto({ inicio_seg: 0, fim_seg: 100, desvios: DE_40_MS }, 0);
    expect([faixa.fica, faixa.bruto, faixa.sai]).toEqual(['1:39', '1:40', 'sai 0:01 em 1 trecho']);
  });

  it('sem trecho, nada sai, também com bruto fracionário', () => {
    expect(resumirCorte({ inicio_seg: 0.4, fim_seg: 100.9, desvios: [] }, undefined).cortes).toBe(
      'fica 1:40 · nada sai',
    );
    expect(descreverOBruto({ inicio_seg: 0.4, fim_seg: 100.9, desvios: [] }, 0).sai).toBe('nada sai');
  });
});
