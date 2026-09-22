import { afterEach, describe, expect, it, vi } from 'vitest';
import { filtrar, gravarBusca, lerBuscas, lerPrefixo, type ItemDaPaleta } from '../fontesDaPaleta';

const itens: ItemDaPaleta[] = [
  { id: 'l', rotulo: 'O sermão da montanha', contexto: 'live · 9 cortes', icone: 'home', escopo: 'lives' },
  { id: 's', rotulo: 'O sermão da montanha', contexto: 'short · corte #04', icone: 'flame', escopo: 'shorts' },
  { id: 'c', rotulo: 'Corte #04 — A regra de ouro', contexto: 'corte · O sermão da montanha', icone: 'scissors', escopo: 'cortes' },
];

describe('fontesDaPaleta', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('acha sem acento (9B)', () => {
    expect(filtrar(itens, 'sermao', 'tudo').map((i) => i.id)).toEqual(['l', 's', 'c']);
  });

  it('casar no começo do rótulo vem antes de casar no contexto', () => {
    expect(filtrar(itens, 'corte 04', 'tudo')[0]?.id).toBe('c');
    expect(filtrar(itens, 'corte 4', 'tudo')[0]?.id).toBe('c');
  });

  it('prefixo escolhe o escopo e sai do termo (9C)', () => {
    expect(lerPrefixo('@sermao', 'tudo')).toEqual({ escopo: 'shorts', termo: 'sermao' });
    expect(lerPrefixo('#04', 'lives')).toEqual({ escopo: 'cortes', termo: '04' });
    expect(filtrar(itens, 'sermao', 'shorts').map((i) => i.id)).toEqual(['s']);
  });

  it('guarda no máximo 5 buscas, sem repetir e sem termo de uma letra (9D, 9E)', () => {
    const guardado = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => guardado.get(k) ?? null,
        setItem: (k: string, v: string) => guardado.set(k, v),
      },
    });
    ['a', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'Dois'].forEach(gravarBusca);
    expect(lerBuscas()).toEqual(['Dois', 'seis', 'cinco', 'quatro', 'tres']);
  });
});
