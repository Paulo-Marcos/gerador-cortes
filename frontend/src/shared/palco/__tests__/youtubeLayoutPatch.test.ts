import { describe, expect, it } from 'vitest';
import {
  chavesMudadas,
  mesclarNoLayoutDoCorte,
  normalizeYoutubeLayout,
  patchParaRestaurar,
} from '../youtubeLayout';

// D-741: o corte grava só as chaves que o operador mudou (RN-10). Estas são as
// três peças da tela; a mescla segue a mesma regra do backend
// (`mesclar_no_layout_do_corte`): chave presente substitui, null volta a herdar.

const REGIAO = { inicio: 1, fim: 5, modo: 'compartilhada' as const };

describe('chavesMudadas', () => {
  it('só a chave que mudou', () => {
    const antes = normalizeYoutubeLayout({ modo_padrao: 'full', regioes: [] });
    const depois = normalizeYoutubeLayout({ ...antes, regioes: [REGIAO] });

    expect(Object.keys(chavesMudadas(antes, depois))).toEqual(['regioes']);
  });

  it('nada mudou, nada a mandar', () => {
    const layout = normalizeYoutubeLayout({});

    expect(chavesMudadas(layout, layout)).toEqual({});
  });
});

describe('mesclarNoLayoutDoCorte', () => {
  it('o layout parcial continua parcial', () => {
    const gravado = { modo_padrao: 'full', regioes: [] };

    expect(mesclarNoLayoutDoCorte(gravado, { regioes: [REGIAO] })).toEqual({
      modo_padrao: 'full',
      regioes: [REGIAO],
    });
  });

  it('null volta a herdar; o gravado em texto também serve', () => {
    const gravado = JSON.stringify({ fundo: 'papel', regioes: [] });

    expect(mesclarNoLayoutDoCorte(gravado, { fundo: null })).toEqual({ regioes: [] });
  });

  it('não muda o objeto que recebeu', () => {
    const gravado = { regioes: [] };
    mesclarNoLayoutDoCorte(gravado, { fundo: 'papel' });

    expect(gravado).toEqual({ regioes: [] });
  });
});

describe('patchParaRestaurar', () => {
  it('a chave que surgiu depois do retrato vai como null', () => {
    const agora = { modo_padrao: 'full', regioes: [REGIAO], fundo: 'papel' };
    const retrato = { modo_padrao: 'full', regioes: [] };

    const patch = patchParaRestaurar(agora, retrato);

    expect(patch).toEqual({ modo_padrao: 'full', regioes: [], fundo: null });
    expect(mesclarNoLayoutDoCorte(agora, patch)).toEqual(retrato);
  });

  it('sem retrato legível, apaga o que há (volta a herdar tudo)', () => {
    expect(patchParaRestaurar({ fundo: 'papel' }, null)).toEqual({ fundo: null });
  });
});
