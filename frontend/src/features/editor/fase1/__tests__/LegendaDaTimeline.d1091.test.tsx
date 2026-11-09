import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LegendaDaTimeline } from '../LegendaDaTimeline';
import { TimelinePanel } from '../TimelinePanel';

// D-1091: a linha do tempo tem a legenda dos quatro casos.

const textoDe = (html: string) => html.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);

describe('LegendaDaTimeline (D-1091)', () => {
  it('mostra os quatro casos, na ordem do design', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="cor-do-corte" />);
    expect(textoDe(html)).toEqual([
      'fica',
      'sai · borda da IA',
      'sai · borda ajustada por você',
      'dentro de outro (conta uma vez)',
    ]);
  });

  it('o "fica" tem a cor do corte na onda', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="cor-do-corte" />);
    expect(html).toContain('background:cor-do-corte');
  });

  it('o quadradinho de cada caso usa a borda que a onda usa', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="c" />);
    expect(html).toMatch(/data-legenda="ia".*?border:1px solid var\(--wb-err\)/);
    expect(html).toMatch(/data-legenda="voce".*?border:2px solid var\(--wb-ok\)/);
    expect(html).toMatch(/data-legenda="dentro".*?top:30%;height:40%/);
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
    expect(html).toContain('sai · borda ajustada por você');
  });
});
