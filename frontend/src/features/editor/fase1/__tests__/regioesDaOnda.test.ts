import { describe, expect, it } from 'vitest';
import type { AlertaConferir, Desvio } from '@/types/models';
import { drawRegions, type RegionsInstance } from '../regioesDaOnda';

// D-998: a onda desenha o alerta "conferir" como uma faixa fixa no topo, à
// parte dos trechos a remover: não arrasta, não redimensiona e não vira desvio.

interface Regiao {
  id: string;
  start: number;
  end: number;
  drag: boolean;
  resize: boolean;
  element: { style: { cssText: string; pointerEvents?: string; overflow?: string }; title: string; attrs: Record<string, string>; setAttribute: (k: string, v: string) => void };
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

const desvio: Desvio = { inicio_hms: '00:00:30', fim_hms: '00:00:40', motivo: 'repete', categoria: 'repeticao' };
const alerta = (id: string, conferido = false): AlertaConferir => ({
  id,
  inicio_hms: '00:01:00.000',
  fim_hms: '00:01:10.000',
  inicio_seg: 60,
  fim_seg: 70,
  motivo: 'cita 40% sem fonte',
  origem: 'claude',
  conferido,
});

describe('drawRegions — alertas para conferir (D-998)', () => {
  it('desenha o alerta pendente como faixa fixa, separada dos desvios', () => {
    const { regions, criadas } = regioesFalsas();

    drawRegions(regions, 0, 120, [desvio], 5, false, [alerta('60000-70000')], 'cor-do-corte');

    expect(criadas.map((r) => r.id)).toEqual(['corte-principal', 'desvio-0', 'alerta-60000-70000']);
    const faixa = criadas[2];
    expect([faixa.start, faixa.end]).toEqual([55, 65]);
    expect([faixa.drag, faixa.resize]).toEqual([false, false]);
    expect(faixa.element.title).toBe('Conferir: cita 40% sem fonte');
    expect(faixa.element.attrs['data-alerta-conferir']).toBe('60000-70000');
    expect(faixa.element.style.cssText).toContain('pointer-events:none');
    expect(faixa.element.style.cssText).toContain('border-top:3px solid var(--wb-warn)');
  });

  it('o alerta conferido sai da onda', () => {
    const { regions, criadas } = regioesFalsas();

    drawRegions(regions, 0, 120, [], 0, true, [alerta('a', true)], 'cor-do-corte');

    expect(criadas.map((r) => r.id)).toEqual(['corte-principal']);
  });
});
