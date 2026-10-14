import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CabecalhoDoCanal,
  COMPONENTES_PADRAO,
  estiloDasCenasDe,
  JanelaLimpa,
  janelaComContorno,
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

  it('no short o buraco recua das bordas e abre um vão entre janelas vizinhas', () => {
    const tela = { x: 51, y: 352, w: 978, h: 608 };
    const pessoa = { x: 0, y: 960, w: 1080, h: 960 };
    const todas = [tela, pessoa];
    // A de baixo encosta na esquerda, na direita e no pé: recua 32; em cima, toca a tela: 12.
    expect(janelaComContorno(pessoa, todas, 1080, 1920)).toEqual({ x: 32, y: 972, w: 1016, h: 916 });
    // A de cima só toca a de baixo: abre o vão embaixo e mais nada.
    expect(janelaComContorno(tela, todas, 1080, 1920)).toEqual({ x: 51, y: 352, w: 978, h: 596 });
    // Cheia: recua das quatro bordas.
    expect(janelaComContorno({ x: 0, y: 0, w: 1080, h: 1920 }, [], 1080, 1920)).toEqual({
      x: 32,
      y: 32,
      w: 1016,
      h: 1856,
    });
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


describe('estilo das cenas da prévia (D-916)', () => {
  it('sem palco, as cenas saem no estilo de sempre', () => {
    expect(estiloDasCenasDe()).toEqual({
      estilo: 'atual',
      ocultos: [],
      escala: 1,
      posicao: { automatica: true, x: 96, y: 112 },
    });
  });

  it('esconder o comparativo esconde também o apelido dele, como o backend', () => {
    const estilo = estiloDasCenasDe({
      ...COMPONENTES_PADRAO,
      estilo: 'limpo',
      cards: { ocultos: ['comparativo_contraponto'], escala: 1.3, posicao: { automatica: true, x: 96, y: 112 } },
    });
    expect(estilo.estilo).toBe('limpo');
    expect(estilo.ocultos).toEqual(['comparativo_contraponto', 'comparativo_enfase']);
    expect(estilo.escala).toBe(1.3);
  });
});
