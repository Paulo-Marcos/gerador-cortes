import { describe, expect, it } from 'vitest';
import {
  mudancaDoArranjo,
  mudancaDoPalco,
  SEGUIR_O_PALCO_PADRAO,
  temPalcoProprio,
} from '../aplicarPalco';
import type { ShortSugerido } from '../shortsApi';

// D-552: aplicar um palco salvo COPIA valores e MARCA a origem.
//
// O operador criava um preset em "Definir palco" e ele nunca mais aparecia: o
// select do painel listava outra familia de preset, e "esta selecionado" nao
// existia como conceito porque aplicar copiava sem deixar rastro.

describe('mudancaDoPalco', () => {
  it('copia os sete campos do preset', () => {
    const corpo = mudancaDoPalco('p1', {
      arranjo: 'dividida_empilhada',
      janela_cheia: 'pessoa',
      recortes: { pessoa: { x: 1, y: 2, w: 3, h: 4 } },
      ajustes: { pessoa: { x: 5, y: 6, w: 7, h: 8 } },
      fundo: 'topographic',
      legenda_cor: '#6aaa84',
      legenda_fonte: 'Anton',
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
    });
  });

  it('D-594: aplicar um palco nao mexe na aparencia do gancho', () => {
    // O gancho tem preset proprio. Se o palco voltasse a escrever `gancho_*`,
    // aplicar um palco apagaria a cor que o trecho escolheu para o letreiro.
    const corpo = mudancaDoPalco('p1', { arranjo: 'cheia' });

    expect(corpo).not.toHaveProperty('gancho_cor');
    expect(corpo).not.toHaveProperty('gancho_realce');
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

describe('o trecho que ninguém tocou segue o palco padrão', () => {
  const intocado = {
    arranjo_palco: '',
    janela_cheia: '',
    fundo_editorial: '',
    legenda_cor: '',
    legenda_fonte: '',
    palco_preset: '',
    palco_short_preset: '',
    ajustes_palco: {},
    recortes_palco: {},
  } as unknown as ShortSugerido;

  it('sem nada gravado ele segue — e não aparece como "ajustado à mão"', () => {
    expect(temPalcoProprio(intocado)).toBe(false);
  });

  it('um preset aplicado conta como próprio: os valores foram copiados', () => {
    const aplicado = { ...intocado, ...mudancaDoPalco('p1', { legenda_cor: '#2f5f43' }) };

    expect(temPalcoProprio(aplicado as ShortSugerido)).toBe(true);
  });

  it('um recorte da mão conta como próprio', () => {
    const recortado = { ...intocado, recortes_palco: { pessoa: { x: 1, y: 2, w: 3, h: 4 } } };

    expect(temPalcoProprio(recortado)).toBe(true);
  });

  it('seguir o padrão devolve o trecho a "sem palco próprio", sem tocar no gancho', () => {
    const aplicado = {
      ...intocado,
      ...mudancaDoPalco('p1', { arranjo: 'cheia', recortes: { pessoa: { x: 1, y: 2, w: 3, h: 4 } } }),
    } as ShortSugerido;

    expect(temPalcoProprio({ ...aplicado, ...SEGUIR_O_PALCO_PADRAO } as ShortSugerido)).toBe(false);
    expect(SEGUIR_O_PALCO_PADRAO).not.toHaveProperty('gancho_cor');
    expect(SEGUIR_O_PALCO_PADRAO).not.toHaveProperty('inicio_seg');
  });
});

describe('escolher um arranjo que falta região', () => {
  const FULL_HD = { largura: 1920, altura: 1080 };
  const PESSOA = { x: 10, y: 20, w: 300, h: 400 };

  it('arranjo possível só troca o arranjo', () => {
    expect(mudancaDoArranjo('cheia', [], { pessoa: PESSOA }, FULL_HD)).toEqual({
      arranjo_palco: 'cheia',
    });
  });

  it('marca a região que falta e aplica o arranjo no mesmo gesto', () => {
    // A dividida vinha travada com "falta marcar: tela" e o clique não fazia
    // nada — o operador lia como tela quebrada.
    const corpo = mudancaDoArranjo('dividida_empilhada', ['tela'], {}, FULL_HD);

    expect(corpo.arranjo_palco).toBe('dividida_empilhada');
    expect(Object.keys(corpo.recortes_palco ?? {})).toEqual(['tela']);
  });

  it('não mexe no recorte que o trecho já marcou', () => {
    const corpo = mudancaDoArranjo('dividida_empilhada', ['tela'], { pessoa: PESSOA }, FULL_HD);

    expect(corpo.recortes_palco?.pessoa).toEqual(PESSOA);
    expect(corpo.recortes_palco).toHaveProperty('tela');
  });
});
