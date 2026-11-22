import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TimelinePanel } from '../TimelinePanel';

// D-1195 (E-069 H-25; DIRECAO §8.2 Foco): a rolagem da onda é um `<div part="scroll">` dentro
// do shadow DOM do wavesurfer. Com 30 000 px de largura, o Chrome a põe na ordem do Tab, e o
// anel global (`:focus-visible` do index.css) não atravessa o shadow DOM: no Editor e na
// Curadoria, o Tab parava na onda sem anel nenhum. O anel entra pelo `::part(scroll)`.

const CLASSE = 'onda-com-foco';

const timeline = () =>
  renderToStaticMarkup(
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
        onSetInicioAqui={vi.fn()}
        onSetFimAqui={vi.fn()}
        onAlternarVelocidade={vi.fn()}
      />
    </TooltipProvider>,
  );

describe('foco visível na onda (wavesurfer)', () => {
  it('o index.css desenha o anel de foco na rolagem da onda, pelo ::part', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const regra = css.match(new RegExp(`\\.${CLASSE}\\s+::part\\(scroll\\):focus-visible\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(regra).toMatch(/outline:\s*2px solid var\(--cc-foco\)/);
  });

  it('a onda do Editor leva a classe', () => {
    expect(timeline()).toMatch(new RegExp(`class="[^"]*\\b${CLASSE}\\b`));
  });

  it('a régua de onda da Curadoria (Shorts) também', () => {
    expect(readFileSync('src/features/shorts/ReguaDeOnda.tsx', 'utf8')).toMatch(new RegExp(`className="[^"]*\\b${CLASSE}\\b`));
  });
});
