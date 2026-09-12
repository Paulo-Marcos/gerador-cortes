import { describe, expect, it } from 'vitest';
import { mudancaDoPalco } from '../aplicarPalco';

// D-552: aplicar um palco salvo COPIA valores e MARCA a origem.
//
// O operador criava um preset em "Definir palco" e ele nunca mais aparecia: o
// select do painel listava outra familia de preset, e "esta selecionado" nao
// existia como conceito porque aplicar copiava sem deixar rastro.

describe('mudancaDoPalco', () => {
  // D-585: eram sete campos e viraram nove — a aparencia do gancho (cor e
  // realce) entrou no preset para poder ser definida UMA vez por corte.
  it('copia os nove campos do preset', () => {
    const corpo = mudancaDoPalco('p1', {
      arranjo: 'dividida_empilhada',
      janela_cheia: 'pessoa',
      recortes: { pessoa: { x: 1, y: 2, w: 3, h: 4 } },
      ajustes: { pessoa: { x: 5, y: 6, w: 7, h: 8 } },
      fundo: 'topographic',
      legenda_cor: '#6aaa84',
      legenda_fonte: 'Anton',
      gancho_cor: '#facc15',
      gancho_realce: 'caixa',
    });

    expect(corpo).toEqual({
      palco_short_preset: 'p1',
      arranjo_palco: 'dividida_empilhada',
      janela_cheia: 'pessoa',
      recortes_palco: { pessoa: { x: 1, y: 2, w: 3, h: 4 } },
      ajustes_palco: { pessoa: { x: 5, y: 6, w: 7, h: 8 } },
      fundo_editorial: 'topographic',
      legenda_cor: '#6aaa84',
      legenda_fonte: 'Anton',
      gancho_cor: '#facc15',
      gancho_realce: 'caixa',
    });
  });

  it('preset antigo, sem o gancho, nao quebra nem inventa cor', () => {
    // Preset salvo antes da D-585 nao tem as chaves. `''` e a resposta certa:
    // "nao decidi" — que e o que faz a heranca continuar viva em vez de
    // carimbar branco no short.
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia' });

    expect(corpo.gancho_cor).toBe('');
    expect(corpo.gancho_realce).toBe('');
  });

  it('preenche o que o preset nao tem, em vez de omitir', () => {
    // `undefined` no PATCH significa "nao mexa". Omitir deixaria o short com
    // metade do palco novo e metade do antigo — um palco que nunca existiu.
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia' });

    expect(corpo.janela_cheia).toBe('');
    expect(corpo.recortes_palco).toEqual({});
    expect(corpo.fundo_editorial).toBe('');
  });

  it('voltar para "ajustado a mao" so limpa a marca', () => {
    // Se limpasse os valores junto, escolher a opcao vazia por engano
    // destruiria o ajuste que o operador acabou de fazer a mao.
    expect(mudancaDoPalco('', null)).toEqual({ palco_short_preset: '' });
  });

  it('nao inventa campos quando nao ha payload', () => {
    const corpo = mudancaDoPalco('', null);

    expect(Object.keys(corpo)).toEqual(['palco_short_preset']);
  });

  it('o fundo do preset vira TEXTURA, e nao cor da paleta', () => {
    // A D-509 gravava uma chave de cor neste campo. Presets salvos naquela
    // epoca trazem algo que nao casa com textura nenhuma; o resolvedor do
    // backend cai no padrao do canal, que e melhor que recusar o preset.
    const corpo = mudancaDoPalco('p1', { fundo: 'verdeCard1' });

    expect(corpo.fundo_editorial).toBe('verdeCard1');
    expect(corpo).not.toHaveProperty('fundo_palco');
  });
});

describe('D-561: o preset guarda o palco inteiro', () => {
  it('traz o tamanho das janelas junto', () => {
    // Sem `ajustes` o preset descrevia meio palco: arranjo e recortes vinham, o
    // tamanho voltava ao do arranjo, e parecia ter funcionado.
    const corpo = mudancaDoPalco('p1', {
      arranjo: 'cheia',
      ajustes: { pessoa: { x: 54, y: 96, w: 972, h: 1728 } },
    });

    expect(corpo.ajustes_palco).toEqual({ pessoa: { x: 54, y: 96, w: 972, h: 1728 } });
  });

  it('preset sem a chave volta ao tamanho do arranjo, e nao ao ultimo usado', () => {
    // `{}` significa "nenhum ajuste". Omitir o campo deixaria o short com o
    // tamanho do trecho ANTERIOR, que nunca fez parte deste preset.
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia' });

    expect(corpo.ajustes_palco).toEqual({});
  });
});

describe('D-563: a cor da legenda viaja com o palco', () => {
  it('vem junto quando o preset a tem', () => {
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia', legenda_cor: '#2f5f43' });

    expect(corpo.legenda_cor).toBe('#2f5f43');
  });

  it('preset antigo volta ao acento do canal, e nao ao realce do trecho anterior', () => {
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia' });

    expect(corpo.legenda_cor).toBe('');
    expect(corpo.legenda_fonte).toBe('');
  });

  it('a fonte vem junto quando o preset a tem', () => {
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia', legenda_fonte: 'Bebas Neue' });

    expect(corpo.legenda_fonte).toBe('Bebas Neue');
  });
});
