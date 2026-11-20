import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { CONTORNO_SOB_AGULHA } from '../agulhaDaOnda';
import { drawRegions, type RegionsInstance } from '../regioesDaOnda';

// D-1150 (achado 2 da auditoria do PR #413): arrastar a borda de um trecho redesenha
// todas as regiões, e elas nasciam sem o contorno de aviso. A agulha guardava o
// índice já marcado e não marcava de novo: o contorno sumia até ela mudar de trecho.
// O redesenho recebe o trecho sob a agulha e o marca já na região nova.

const desvio = (inicio: string, fim: string) =>
  ({ inicio_hms: inicio, fim_hms: fim, categoria: 'silencio' }) as unknown as Desvio;

type Elemento = {
  style: Record<string, string>;
  atributos: Set<string>;
  title: string;
  setAttribute: (k: string) => void;
  toggleAttribute: (k: string, ligado: boolean) => void;
};

function regioesFalsas() {
  const criadas: { id: string; element: Elemento }[] = [];
  const regions = {
    clearRegions: () => criadas.splice(0),
    addRegion: (r: { id: string }) => {
      const atributos = new Set<string>();
      const element: Elemento = {
        style: {},
        atributos,
        title: '',
        setAttribute: (k) => atributos.add(k),
        toggleAttribute: (k, ligado) => (ligado ? atributos.add(k) : atributos.delete(k)),
      };
      const criada = { ...r, element };
      criadas.push(criada);
      return criada;
    },
  } as unknown as RegionsInstance;
  return { regions, criadas };
}

const DESVIOS = [desvio('00:00:10', '00:00:20'), desvio('00:00:40', '00:00:45')];

describe('o redesenho das regiões mantém o trecho sob a agulha', () => {
  it('a região nova do trecho sob a agulha já nasce com o contorno de aviso', () => {
    const { regions, criadas } = regioesFalsas();
    drawRegions(regions, 0, 60, DESVIOS, 0, false, [], 'cor', 1);
    const porId = Object.fromEntries(criadas.map((r) => [r.id, r.element]));
    expect(porId['desvio-1'].style.outline).toBe(CONTORNO_SOB_AGULHA);
    expect(porId['desvio-1'].atributos.has('data-sob-agulha')).toBe(true);
    expect(porId['desvio-0'].style.outline ?? '').toBe('');
    expect(porId['corte-principal'].style.outline).toBeUndefined();
  });

  it('com a agulha no que fica, nenhum trecho ganha o contorno', () => {
    const { regions, criadas } = regioesFalsas();
    drawRegions(regions, 0, 60, DESVIOS, 0, false, [], 'cor', -1);
    expect(criadas.filter((r) => r.element.atributos.has('data-sob-agulha'))).toEqual([]);
  });
});
