import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { PlayerPanel } from '../PlayerPanel';
import { OuvirEmenda } from '../OuvirEmenda';

// D-1091: com o cursor num trecho que sai, o preview mostra o aviso
// "SAI · 17 s · SILÊNCIO", a justificativa, o ponto da emenda e "Ouvir a emenda".

const SILENCIO: Desvio = {
  inicio_hms: '00:05:05',
  fim_hms: '00:05:22',
  motivo: 'Vídeo sem diálogo útil.',
  categoria: 'silencio',
};

// O player começa no início do corte: um corte que começa dentro do trecho já
// abre com o cursor nele.
const preview = (inicioSeg: number) =>
  renderToStaticMarkup(<PlayerPanel src="" inicioSeg={inicioSeg} fimSeg={400} desvios={[SILENCIO]} />);

describe('PlayerPanel — o aviso do trecho que sai (D-1091)', () => {
  it('dentro do trecho: título, justificativa, emenda e o botão', () => {
    const html = preview(306);
    expect(html).toContain('sai · 17 s · silencio');
    expect(html).toContain('Vídeo sem diálogo útil.');
    expect(html).toMatch(/emenda em (<!-- -->)?05:22/);
    expect(html).toMatch(/<button[^>]*>.*Ouvir a emenda<\/button>/);
  });

  it('fora do trecho, nada de aviso', () => {
    const html = preview(200);
    expect(html).not.toContain('sai · 17 s');
    expect(html).not.toContain('Ouvir a emenda');
  });
});

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children as ReactNode)];
}

describe('OuvirEmenda — o botão toca a emenda (D-1091)', () => {
  it('o clique leva o vídeo para antes do trecho e toca', () => {
    const video = {
      currentTime: 310,
      paused: true,
      isConnected: true,
      play() {
        this.paused = false;
      },
      pause() {},
      addEventListener() {},
      removeEventListener() {},
    };
    const arvore = elementos(
      OuvirEmenda({
        aviso: { titulo: '', justificativa: '', inicio: 305, emenda: 322 },
        videoRef: { current: video as unknown as HTMLVideoElement },
      }),
    );
    const botao = arvore.find((e) => e.type === 'button')!;
    globalThis.requestAnimationFrame ??= () => 0;
    globalThis.cancelAnimationFrame ??= () => undefined;
    (botao.props.onClick as () => void)();
    expect(video.currentTime).toBe(302);
    expect(video.paused).toBe(false);
  });
});
