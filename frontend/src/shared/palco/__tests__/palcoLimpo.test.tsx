import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CabecalhoDoCanal,
  JanelaLimpa,
  PlacaLimpa,
  posicaoDaPlaca,
  posicaoDoCabecalhoNoShort,
  raioDaJanela,
} from '../palcoLimpo';

// D-911: a prévia monta os componentes do renderer; só a janela e a imagem por
// URL são dela.

describe('palco limpo (D-911)', () => {
  it('a janela que atravessa o quadro não leva canto; a que tem margem leva', () => {
    expect(raioDaJanela({ x: 0, y: 0, w: 1080, h: 1920 }, 1080, 1920, 24)).toBe(0);
    // Empilhada: as duas janelas vão de lado a lado — canto ali seria fundo na borda.
    expect(raioDaJanela({ x: 0, y: 352, w: 1080, h: 608 }, 1080, 1920, 24)).toBe(0);
    // Insert: a tela flutua com margem e leva o canto.
    expect(raioDaJanela({ x: 64, y: 400, w: 952, h: 535 }, 1080, 1920, 24)).toBe(24);
  });

  it('o cabeçalho do short só existe quando há faixa acima da primeira janela', () => {
    expect(posicaoDoCabecalhoNoShort({ x: 0, y: 0, w: 1080, h: 1920 })).toBeNull();
    expect(posicaoDoCabecalhoNoShort(undefined)).toBeNull();
    expect(posicaoDoCabecalhoNoShort({ x: 0, y: 352, w: 1080, h: 608 })).toEqual({ x: 48, y: 232 });
  });

  it('a placa cede ao cabeçalho: acima da tela, à direita dele, ou dentro da tela', () => {
    // Tela à direita do cabeçalho: acima dela, encostada à esquerda.
    expect(posicaoDaPlaca({ x: 900, y: 150, w: 925, h: 720 }, true)).toEqual({
      x: 900,
      y: 86,
      dentroDaTela: false,
    });
    // Tela larga que começa alta e à esquerda: desliza para a direita do cabeçalho.
    expect(posicaoDaPlaca({ x: 150, y: 140, w: 1625, h: 731 }, true)).toEqual({
      x: 824,
      y: 76,
      dentroDaTela: false,
    });
    // Tela estreita, alta e à esquerda: não cabe nem à direita — entra na tela.
    expect(posicaoDaPlaca({ x: 100, y: 120, w: 600, h: 400 }, true)).toEqual({
      x: 124,
      y: 120 + 400 - 56 - 24,
      dentroDaTela: true,
    });
    // Sem cabeçalho não há com quem bater.
    expect(posicaoDaPlaca({ x: 150, y: 140, w: 1625, h: 731 }, false)).toEqual({
      x: 150,
      y: 76,
      dentroDaTela: false,
    });
  });

  it('o cabeçalho desenha imagem, nome e @; a placa só texto', () => {
    const cabecalho = renderToStaticMarkup(
      <CabecalhoDoCanal x={64} y={64} nome="Pedro Ivo" handle="@pedroivosa" imagemSrc="/img.png" />,
    );
    expect(cabecalho).toContain('src="/img.png"');
    expect(cabecalho).toContain('Pedro Ivo');
    expect(cabecalho).toContain('@pedroivosa');

    const placa = renderToStaticMarkup(<PlacaLimpa x={500} y={86} nome="Rodrigo" papel="Insider" />);
    expect(placa).toContain('Rodrigo');
    expect(placa).toContain('Insider');
    expect(renderToStaticMarkup(<PlacaLimpa x={0} y={0} />)).toBe('');
  });

  it('a janela da prévia recorta com o raio e põe o conteúdo dentro', () => {
    const html = renderToStaticMarkup(
      <JanelaLimpa janela={{ x: 500, y: 150, w: 1325, h: 720 }} raio={20}>
        <span>video</span>
      </JanelaLimpa>,
    );
    expect(html).toContain('border-radius:20px');
    expect(html).toContain('left:500px');
    expect(html).toContain('<span>video</span>');
  });
});
