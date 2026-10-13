import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CabecalhoDoCanal,
  JanelaLimpa,
  PlacaLimpa,
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
