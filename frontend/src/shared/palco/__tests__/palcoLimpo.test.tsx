import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CabecalhoDoCanal,
  PlacaLimpa,
  RAIO_DA_JANELA_DO_SHORT,
  posicaoDoCabecalhoNoShort,
  raioDaJanela,
} from '../palcoLimpo';

// D-911: o palco limpo da prévia e o do renderer são cópias; os números têm de bater.

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

  it('os números do espelho batem com os do renderer', () => {
    const renderer = readFileSync(
      resolve(__dirname, '../../../../../video-renderer/src/youtube-bg/palco-limpo.tsx'),
      'utf-8',
    );
    for (const constante of [
      'COR_DO_FUNDO = "#121417"',
      'RAIO_DA_TELA = 20',
      'RAIO_DA_FACECAM = 14',
      `RAIO_DA_JANELA_DO_SHORT = ${RAIO_DA_JANELA_DO_SHORT}`,
      'CABECALHO_HORIZONTAL = { x: 64, y: 64 }',
      'FOLGA_DO_CABECALHO_NO_SHORT = 120',
      'FAIXA_MINIMA_PARA_O_CABECALHO = 200',
    ]) {
      expect(renderer).toContain(constante);
    }
  });
});
