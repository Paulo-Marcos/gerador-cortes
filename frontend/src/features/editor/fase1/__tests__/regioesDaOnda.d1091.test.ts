import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { drawRegions, type RegionsInstance } from '../regioesDaOnda';
import { ESTILO_DO_TRECHO } from '../origemDaBorda';

// D-1091: a onda pinta cada trecho que sai com o caso dele: a borda diz de quem
// é (IA ou você) e o trecho dentro de outro vira uma faixa por cima.

interface Regiao {
  id: string;
  color: string;
  element: { style: Record<string, string>; title: string; attrs: Record<string, string>; setAttribute: (k: string, v: string) => void };
}

function regioesFalsas() {
  const criadas: Regiao[] = [];
  const regions = {
    clearRegions: () => criadas.splice(0),
    addRegion: (opcoes: Omit<Regiao, 'element'>) => {
      const attrs: Record<string, string> = {};
      const regiao: Regiao = {
        ...opcoes,
        element: { style: { cssText: '' }, title: '', attrs, setAttribute: (k, v) => (attrs[k] = v) },
      };
      criadas.push(regiao);
      return regiao;
    },
  };
  return { regions: regions as unknown as RegionsInstance, criadas };
}

const desvio = (inicio: string, fim: string, extra: Partial<Desvio> = {}): Desvio => ({
  inicio_hms: inicio,
  fim_hms: fim,
  motivo: 'x',
  categoria: 'silencio',
  origem: 'claude',
  ...extra,
});

describe('drawRegions — a origem da borda na onda (D-1091)', () => {
  it('marca cada trecho com o caso dele e aplica o estilo do caso', () => {
    const { regions, criadas } = regioesFalsas();
    const desvios = [
      desvio('00:00:30', '00:00:50', { rodada: 1, borda_da_rodada: [30, 50] }),
      desvio('00:00:35', '00:00:40'),
      desvio('00:01:00', '00:01:10', { rodada: 1, borda_da_rodada: [60, 68] }),
    ];

    drawRegions(regions, 0, 120, desvios, 0, false, [], 'cor-do-corte');

    const trechos = criadas.filter((r) => r.id.startsWith('desvio-'));
    expect(trechos.map((r) => r.element.attrs['data-trecho'])).toEqual(['ia', 'dentro', 'voce']);
    expect(trechos[0].element.style.border).toBe(ESTILO_DO_TRECHO.ia.border);
    expect(trechos[2].element.style.border).toBe(ESTILO_DO_TRECHO.voce.border);
    expect(trechos[1].element.style).toMatchObject({ top: '30%', height: '40%', zIndex: '2' });
    expect(trechos.map((r) => r.element.title)).toEqual([
      'sai · borda da IA',
      'dentro de outro (conta uma vez)',
      'sai · borda ajustada por você',
    ]);
  });

  it('a borda da IA e a sua se distinguem pela cor e pela espessura', () => {
    expect(ESTILO_DO_TRECHO.ia.border).not.toBe(ESTILO_DO_TRECHO.voce.border);
    expect(ESTILO_DO_TRECHO.voce.border).toMatch(/^2px/);
  });

  it('o corte (o que fica) segue sem marca de trecho', () => {
    const { regions, criadas } = regioesFalsas();
    drawRegions(regions, 0, 120, [desvio('00:00:30', '00:00:50')], 0, true, [], 'cor-do-corte');
    expect(criadas[0].id).toBe('corte-principal');
    expect(criadas[0].color).toBe('cor-do-corte');
    expect(criadas[0].element.attrs['data-trecho']).toBeUndefined();
  });
});
