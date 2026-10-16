import type { YoutubeSharedRect } from '@/shared/palco/youtubeLayout';

// D-928: alinhar um objeto aos outros enquanto se arrasta. As bordas e o meio
// do que se move "grudam" nas bordas e no meio dos outros objetos e do quadro
// (1920x1080) quando chegam perto, e uma linha mostra onde alinhou — o mesmo
// gesto das ferramentas de design.

/** A distância, em px do quadro, em que uma borda gruda na outra. */
export const LIMIAR_DE_ENCAIXE = 12;

export interface Alvos {
  x: number[];
  y: number[];
}

export interface Guias {
  x: number | null;
  y: number | null;
}

export const SEM_GUIAS: Guias = { x: null, y: null };

/** As linhas que servem de referência: bordas e meio do quadro e de cada outro objeto. */
export function alvosDe(outros: readonly YoutubeSharedRect[], quadro = { w: 1920, h: 1080 }): Alvos {
  const x = [0, quadro.w / 2, quadro.w];
  const y = [0, quadro.h / 2, quadro.h];
  for (const r of outros) {
    x.push(r.x, r.x + r.w / 2, r.x + r.w);
    y.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { x, y };
}

/** O alvo mais perto de algum dos pontos, e quanto andar para chegar nele. */
function maisPerto(pontos: number[], alvos: number[], limiar: number): { desvio: number; linha: number } | null {
  let melhor: { desvio: number; linha: number } | null = null;
  for (const p of pontos) {
    for (const a of alvos) {
      const desvio = a - p;
      if (Math.abs(desvio) <= limiar && (!melhor || Math.abs(desvio) < Math.abs(melhor.desvio))) {
        melhor = { desvio, linha: a };
      }
    }
  }
  return melhor;
}

/**
 * O retângulo depois do encaixe. Ao mover, as três linhas de cada eixo
 * (começo, meio, fim) procuram alvo; ao redimensionar, só a borda que a alça
 * puxa (direita e de baixo).
 */
export function encaixar(
  rect: YoutubeSharedRect,
  modo: 'mover' | 'redimensionar',
  alvos: Alvos,
  limiar = LIMIAR_DE_ENCAIXE,
): { rect: YoutubeSharedRect; guias: Guias } {
  if (modo === 'mover') {
    const x = maisPerto([rect.x, rect.x + rect.w / 2, rect.x + rect.w], alvos.x, limiar);
    const y = maisPerto([rect.y, rect.y + rect.h / 2, rect.y + rect.h], alvos.y, limiar);
    return {
      rect: { ...rect, x: Math.round(rect.x + (x?.desvio ?? 0)), y: Math.round(rect.y + (y?.desvio ?? 0)) },
      guias: { x: x?.linha ?? null, y: y?.linha ?? null },
    };
  }
  const x = maisPerto([rect.x + rect.w], alvos.x, limiar);
  const y = maisPerto([rect.y + rect.h], alvos.y, limiar);
  return {
    rect: { ...rect, w: Math.round(rect.w + (x?.desvio ?? 0)), h: Math.round(rect.h + (y?.desvio ?? 0)) },
    guias: { x: x?.linha ?? null, y: y?.linha ?? null },
  };
}

/** D-937: o quadro da prévia, em px — o vídeo (1920x1080) ou o short (1080x1920). */
export interface Quadro {
  largura: number;
  altura: number;
}
export const QUADRO_DO_VIDEO: Quadro = { largura: 1920, altura: 1080 };

/** Os outros objetos da prévia (janelas, zona, componentes), em px do quadro, menos o que se move. */
export function outrosNaPrevia(frame: HTMLElement, excluir: Element, largura = QUADRO_DO_VIDEO.largura): YoutubeSharedRect[] {
  const quadro = frame.getBoundingClientRect();
  if (quadro.width === 0) return [];
  const k = largura / quadro.width;
  return [...frame.querySelectorAll('[data-retangulo], [data-arrastavel]')]
    .filter((el) => el !== excluir && !el.contains(excluir) && !excluir.contains(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: (r.left - quadro.left) * k, y: (r.top - quadro.top) * k, w: r.width * k, h: r.height * k };
    });
}

/** As linhas de alinhamento sobre a prévia, enquanto se arrasta. */
export function GuiasNaPrevia({ guias, quadro = QUADRO_DO_VIDEO }: { guias: Guias; quadro?: Quadro }) {
  return (
    <>
      {guias.x !== null && (
        <span
          aria-hidden
          data-guia="vertical"
          className="pointer-events-none absolute top-0 h-full w-px bg-[var(--wb-info)]"
          style={{ left: `${(guias.x / quadro.largura) * 100}%` }}
        />
      )}
      {guias.y !== null && (
        <span
          aria-hidden
          data-guia="horizontal"
          className="pointer-events-none absolute left-0 h-px w-full bg-[var(--wb-info)]"
          style={{ top: `${(guias.y / quadro.altura) * 100}%` }}
        />
      )}
    </>
  );
}
