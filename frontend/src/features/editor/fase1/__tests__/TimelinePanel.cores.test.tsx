import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TimelinePanel } from '../TimelinePanel';

// D-871 (canvas do Editor, nota 4 "Cor fica para estado"): marcar o início e
// o fim e mudar a velocidade são ajustes, não estados. O verde e o vermelho do
// In/Out diziam "certo" e "erro"; o âmbar da velocidade dizia "atenção".

function render() {
  return renderToStaticMarkup(
    <TooltipProvider>
      <TimelinePanel
        audioSrc=""
        waveformPeaksSrc=""
        inicioSeg={0}
        fimSeg={60}
        desvios={[]}
        currentTime={0}
        playbackRate={1.5}
        onSeek={vi.fn()}
        onChangeSpeed={vi.fn()}
        onSetInicioAqui={vi.fn()}
        onSetFimAqui={vi.fn()}
        onAlternarVelocidade={vi.fn()}
      />
    </TooltipProvider>,
  );
}

const botao = (html: string, rotulo: string) =>
  html.match(new RegExp(`<button[^>]*aria-label="${rotulo}"[^>]*>(.*?)</button>`))!;
const semTags = (html: string) => html.replace(/<[^>]+>/g, '');

describe('TimelinePanel — cor fica para estado (D-871)', () => {
  it('início e fim com a própria tecla no rótulo: "[ Início aqui" e "Fim aqui ]"', () => {
    const html = render();
    expect(semTags(botao(html, 'Marcar inicio aqui')[1])).toBe('[Início aqui');
    expect(semTags(botao(html, 'Marcar fim aqui')[1])).toBe('Fim aqui]');
  });

  it('os dois são neutros e iguais: sem o verde e o vermelho de antes', () => {
    const html = render();
    const [inicio, fim] = ['Marcar inicio aqui', 'Marcar fim aqui'].map((r) => botao(html, r)[0]);
    for (const b of [inicio, fim]) expect(b).not.toMatch(/ok-|err/);
    expect(inicio.match(/class="([^"]*)"/)![1]).toBe(fim.match(/class="([^"]*)"/)![1]);
    expect(inicio).toContain('text-[var(--wb-text)]');
  });

  it('a velocidade sai sem âmbar', () => {
    const velocidade = botao(render(), 'Alternar velocidade')[0];
    expect(semTags(velocidade)).toBe('1.50×');
    expect(velocidade).not.toContain('warn');
    expect(velocidade).toContain('text-[var(--wb-text)]');
  });
});
