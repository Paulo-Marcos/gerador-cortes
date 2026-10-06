import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { TimelinePanel } from '../TimelinePanel';

// D-871 (canvas do Editor, nota 4 "Cor fica para estado"): marcar o início e
// o fim e mudar a velocidade são ajustes, não estados. O verde e o vermelho do
// In/Out diziam "certo" e "erro"; o âmbar da velocidade dizia "atenção".

const props = (marcar: { inicio?: () => void; fim?: () => void } = {}) => ({
  audioSrc: '',
  waveformPeaksSrc: '',
  inicioSeg: 0,
  fimSeg: 60,
  desvios: [],
  currentTime: 0,
  playbackRate: 1.5,
  onSeek: vi.fn(),
  onChangeSpeed: vi.fn(),
  onSetInicioAqui: marcar.inicio ?? vi.fn(),
  onSetFimAqui: marcar.fim ?? vi.fn(),
  onAlternarVelocidade: vi.fn(),
});

function render() {
  return renderToStaticMarkup(
    <TooltipProvider>
      <TimelinePanel {...props()} />
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

// Sem DOM: a sonda chama o painel como função dentro de um render e aciona os
// onClick da árvore de elementos que ele devolve.
type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children as ReactNode)];
}

function arvoreDaTimeline(marcar: { inicio: () => void; fim: () => void }) {
  let arvore: Elemento[] = [];
  function Sonda() {
    arvore = elementos(TimelinePanel(props(marcar)));
    return null;
  }
  renderToStaticMarkup(
    <TooltipProvider>
      <Sonda />
    </TooltipProvider>,
  );
  return arvore;
}

describe('TimelinePanel — os marcadores fazem o que dizem (D-871)', () => {
  it('"Início aqui" marca o início, "Fim aqui" marca o fim — e os dois estão ligados', () => {
    const inicio = vi.fn();
    const fim = vi.fn();
    const arvore = arvoreDaTimeline({ inicio, fim });
    const botao = (rotulo: string) => arvore.find((e) => e.props['aria-label'] === rotulo)!;

    expect(botao('Marcar inicio aqui').props.disabled).toBe(false);
    expect(botao('Marcar fim aqui').props.disabled).toBe(false);
    (botao('Marcar inicio aqui').props.onClick as () => void)();
    expect([inicio.mock.calls.length, fim.mock.calls.length]).toEqual([1, 0]);
    (botao('Marcar fim aqui').props.onClick as () => void)();
    expect([inicio.mock.calls.length, fim.mock.calls.length]).toEqual([1, 1]);
  });

  it('a dica de cada um ensina a tecla: [ e ]', () => {
    const arvore = arvoreDaTimeline({ inicio: vi.fn(), fim: vi.fn() });
    const dica = (rotulo: string) =>
      arvore.find(
        (e) =>
          e.type === Tooltip &&
          elementos(e.props.children as ReactNode).some((c) => c.props['aria-label'] === rotulo),
      )!.props.label;
    expect(dica('Marcar inicio aqui')).toContain('( [ )');
    expect(dica('Marcar fim aqui')).toContain('( ] )');
  });
});
