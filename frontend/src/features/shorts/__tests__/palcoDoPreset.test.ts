import { describe, expect, it } from 'vitest';
import type { PalcoShortPreset } from '@/types/presets';
import { corpoDoPalcoNoCorte, opcoesDoPalcoPadrao, presetComPalco } from '../palcoDoPreset';

// D-960: o preset do short montado pelos padrões do corte guarda o estilo e o
// palco (nome, @, cabeçalho, legenda), e escolhê-lo como padrão leva esse palco
// ao corte. O select dos padrões só oferece os presets do estilo ativo.

const FOTO: PalcoShortPreset = {
  arranjo: 'cheia',
  janela_cheia: '',
  recortes: {},
  ajustes: {},
  fundo: '',
  legenda_cor: '',
  legenda_fonte: '',
};

describe('preset de palco com o estilo e o palco (D-960)', () => {
  it('guarda o estilo e o palco junto da foto do trecho', () => {
    const palco = { estilo: 'limpo' as const, cabecalho: { nome: 'Pedro', handle: '@pedro' } };
    expect(presetComPalco(FOTO, 'limpo', palco)).toEqual({ ...FOTO, estilo: 'limpo', palco });
  });
});

describe('palco do preset no corte (D-960)', () => {
  const alvo = { corteId: 'c1', projetoId: 'p1' };

  it('escolher o preset como padrão grava o palco dele no corte', () => {
    const palco = { estilo: 'limpo', cabecalho: { nome: 'Pedro' } };
    expect(corpoDoPalcoNoCorte({ ...FOTO, palco }, alvo)).toEqual({
      escopo: 'corte',
      tipo: 'short',
      projeto_id: 'p1',
      corte_id: 'c1',
      componentes: palco,
    });
  });

  it('preset sem palco (o antigo) ou corte sem projeto não grava nada', () => {
    expect(corpoDoPalcoNoCorte(FOTO, alvo)).toBeNull();
    expect(corpoDoPalcoNoCorte({ ...FOTO, palco: { estilo: 'limpo' } }, { corteId: 'c1', projetoId: undefined })).toBeNull();
  });
});

describe('opções do palco padrão do corte (D-960)', () => {
  const disponiveis = [
    { id: 'antigo', nome: 'Rosto cheio' },
    { id: 'limpo', nome: 'Limpo da live' },
  ];

  it('só aparecem os presets do estilo ativo', () => {
    expect(opcoesDoPalcoPadrao(disponiveis, [{ id: 'limpo' }], '')).toEqual([{ id: 'limpo', nome: 'Limpo da live' }]);
  });

  it('o padrão já escolhido de outro estilo continua no select, marcado, para o select não mentir', () => {
    expect(opcoesDoPalcoPadrao(disponiveis, [{ id: 'limpo' }], 'antigo')).toEqual([
      { id: 'antigo', nome: 'Rosto cheio (outro estilo)' },
      { id: 'limpo', nome: 'Limpo da live' },
    ]);
  });
});
