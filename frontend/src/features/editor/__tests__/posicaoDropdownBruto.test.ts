import { describe, expect, it } from 'vitest';
import { posicionarDropdown } from '../posicaoDropdownBruto';

const VIEWPORT = { largura: 1920, altura: 1080 };
const LARGURA = 256;

describe('posicionarDropdown', () => {
  it('alinha a direita do gatilho quando ha espaco a esquerda', () => {
    const pos = posicionarDropdown({ left: 1600, right: 1640, bottom: 80 }, VIEWPORT, LARGURA);

    expect(pos.left).toBe(1640 - LARGURA);
  });

  it('NAO deixa o painel sair pela esquerda quando o gatilho esta no inicio', () => {
    // O caso real: icone de regerar na barra do Bruto, com a sidebar atras.
    const pos = posicionarDropdown({ left: 340, right: 372, bottom: 80 }, VIEWPORT, LARGURA);

    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it('NAO deixa o painel sair pela direita quando o gatilho esta na borda', () => {
    const pos = posicionarDropdown({ left: 1900, right: 1918, bottom: 80 }, VIEWPORT, LARGURA);

    expect(pos.left + LARGURA).toBeLessThanOrEqual(VIEWPORT.largura - 8);
  });

  it('abre logo abaixo do gatilho', () => {
    const pos = posicionarDropdown({ left: 100, right: 140, bottom: 96 }, VIEWPORT, LARGURA);

    expect(pos.top).toBe(100);
  });

  it('limita a altura ao que sobra da tela, em vez de vazar por baixo', () => {
    const pos = posicionarDropdown({ left: 100, right: 140, bottom: 900 }, VIEWPORT, LARGURA);

    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(VIEWPORT.altura);
  });

  it('em tela estreita ainda cabe, encostado na margem', () => {
    const pos = posicionarDropdown({ left: 10, right: 40, bottom: 60 }, { largura: 320, altura: 640 }, LARGURA);

    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + LARGURA).toBeLessThanOrEqual(320);
  });

  it('nunca devolve altura util ridicula, mesmo com o gatilho no rodape', () => {
    const pos = posicionarDropdown({ left: 100, right: 140, bottom: 1075 }, VIEWPORT, LARGURA);

    expect(pos.maxHeight).toBeGreaterThanOrEqual(120);
  });
});
