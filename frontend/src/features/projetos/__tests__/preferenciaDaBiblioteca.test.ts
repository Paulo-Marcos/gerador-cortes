import { describe, expect, it } from 'vitest';
import { lerPreferenciaDaBiblioteca } from '../bibliotecaFiltros';

describe('lerPreferenciaDaBiblioteca', () => {
  it('devolve o filtro e a ordem gravados', () => {
    expect(
      lerPreferenciaDaBiblioteca(JSON.stringify({ filtro: 'nao_limpos', ordem: 'titulo' })),
    ).toEqual({ filtro: 'nao_limpos', ordem: 'titulo' });
  });

  it('cai no padrao sem nada gravado ou com JSON quebrado', () => {
    const padrao = { filtro: 'todos', ordem: 'recentes' };
    expect(lerPreferenciaDaBiblioteca(null)).toEqual(padrao);
    expect(lerPreferenciaDaBiblioteca('{quebrado')).toEqual(padrao);
  });

  it('descarta so o campo que nao existe mais', () => {
    expect(
      lerPreferenciaDaBiblioteca(JSON.stringify({ filtro: 'sumiu', ordem: 'antigos' })),
    ).toEqual({ filtro: 'todos', ordem: 'antigos' });
  });
});
