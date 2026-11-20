import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LegendaDaTimeline } from '../LegendaDaTimeline';
import { TimelinePanel } from '../TimelinePanel';

// D-1091: a linha do tempo tem a legenda dos quatro casos.

const textoDe = (html: string) => html.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);

describe('LegendaDaTimeline (D-1091)', () => {
  it('mostra os quatro casos, cada um pelo que se vê na onda e depois pelo que significa', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="cor-do-corte" />);
    expect(textoDe(html)).toEqual([
      'fica',
      ', aceso',
      'véu listrado',
      ' · sai, pela IA',
      'véu com contorno íris',
      ' · sai, ajustado por você',
      'faixa mais baixa',
      ' · dentro de outro (conta uma vez)',
      'o tom por baixo do véu é a cor da categoria',
    ]);
  });

  it('opção A (Paulo, 09/11): não promete o vermelho único do board', () => {
    // O preenchimento do que sai é a cor da categoria (D-515); a legenda não
    // pode pintar o "sai" de vermelho, senão descreve uma tela que não existe.
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="c" />);
    expect(html).not.toMatch(/--(?:wb|cc)-err/);
    expect(html).toContain('o tom por baixo do véu é a cor da categoria');
  });

  it('o "fica" tem a cor do corte na onda', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="cor-do-corte" />);
    expect(html).toContain('--fundo:cor-do-corte');
  });

  it('o quadradinho de cada caso usa a borda que a onda usa', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="c" />);
    expect(html).toMatch(/data-legenda="ia".*?--borda:1px solid var\(--cc-fio-2\)/);
    expect(html).toMatch(/data-legenda="voce".*?--borda:2px solid var\(--cc-iris\)/);
    expect(html).toMatch(/data-legenda="dentro".*?--topo:30%;--altura:40%/);
  });

  it('aparece na linha do tempo, abaixo da onda', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <TimelinePanel
          audioSrc=""
          waveformPeaksSrc=""
          inicioSeg={0}
          fimSeg={60}
          desvios={[]}
          currentTime={0}
          playbackRate={1}
          onSeek={vi.fn()}
          onChangeSpeed={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(html).toContain('aria-label="Legenda da linha do tempo"');
    expect(html).toContain('sai, ajustado por você');
  });
});
