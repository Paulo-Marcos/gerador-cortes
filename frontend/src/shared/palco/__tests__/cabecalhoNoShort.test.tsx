import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CabecalhoDoCanal,
  COMPONENTES_PADRAO,
  posicaoDoCabecalhoNoShortDe,
  RECUO_DO_CABECALHO_NA_JANELA,
} from '../palcoLimpo';

// D-936: o cabeçalho do canal no short limpo. Antes ele só existia na faixa
// acima da primeira janela — e no arranjo cheio (o padrão), sem faixa, sumia.

const W = 1080;
const H = 1920;
const CHEIA = { x: 0, y: 0, w: W, h: H };
const ativo = { cabecalho: { ativo: true }, placa: {} };

describe('cabeçalho no short (D-936)', () => {
  it('no arranjo cheio, sem faixa, senta dentro da janela, sobre o vídeo', () => {
    const contorno = 32;
    expect(posicaoDoCabecalhoNoShortDe(ativo, [CHEIA], W, H, contorno)).toEqual({
      x: contorno + RECUO_DO_CABECALHO_NA_JANELA,
      y: contorno + RECUO_DO_CABECALHO_NA_JANELA,
      sobreOVideo: true,
    });
  });

  it('com faixa acima da janela mais alta, fica na faixa — mesmo fora de ordem', () => {
    const tela = { x: 0, y: 352, w: W, h: 608 };
    const pessoa = { x: 0, y: 960, w: W, h: 960 };
    expect(posicaoDoCabecalhoNoShortDe(ativo, [pessoa, tela], W, H)).toEqual({
      x: 48,
      y: 232,
      sobreOVideo: false,
    });
  });

  it('a posição que o canal fixou vence, e diz se caiu sobre o vídeo', () => {
    const fixa = {
      cabecalho: { ativo: true, posicao_short: { automatica: false, x: 100, y: 40 } },
      placa: {},
    };
    expect(posicaoDoCabecalhoNoShortDe(fixa, [{ x: 0, y: 352, w: W, h: 608 }], W, H)).toEqual({
      x: 100,
      y: 40,
      sobreOVideo: false,
    });
    expect(posicaoDoCabecalhoNoShortDe(fixa, [CHEIA], W, H)?.sobreOVideo).toBe(true);
  });

  it('desligado ou sem janela, não há cabeçalho', () => {
    expect(posicaoDoCabecalhoNoShortDe({ cabecalho: { ativo: false }, placa: {} }, [CHEIA], W, H)).toBeNull();
    expect(posicaoDoCabecalhoNoShortDe(ativo, [], W, H)).toBeNull();
  });

  it('sobre o vídeo o cabeçalho leva a pílula; na faixa, não', () => {
    const props = { x: 0, y: 0, nome: 'Canal', handle: '@canal' };
    const comPilula = renderToStaticMarkup(<CabecalhoDoCanal {...props} comPilula />);
    const semPilula = renderToStaticMarkup(<CabecalhoDoCanal {...props} />);
    expect(comPilula).toContain('border-radius:999px');
    expect(semPilula).not.toContain('border-radius:999px');
    expect(comPilula).toContain('Canal');
  });

  it('o padrão do canal tem o cabeçalho ligado', () => {
    expect(COMPONENTES_PADRAO.cabecalho.ativo).toBe(true);
  });
});
