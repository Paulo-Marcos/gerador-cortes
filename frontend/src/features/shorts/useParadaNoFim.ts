import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { alcancouOFim, desarmaNoSeek } from './paradaNoFim';

// D-539: a ponte entre a regra de parada e o `<video>`.
//
// A vigília roda em `requestAnimationFrame`, e não no `timeupdate` do elemento.
// O `timeupdate` dispara a cada ~250ms, o que num vídeo a 1× significa passar
// até um quarto de segundo do fim antes de perceber — tempo de sobra para o
// primeiro quadro do assunto seguinte aparecer. O rAF acerta o quadro, custa
// nada enquanto está desarmado (não há loop) e para sozinho ao pausar.

interface Navegacao {
  /** Vai para o início e para sozinho no fim. */
  tocarAte: (inicioSeg: number, fimSeg: number) => void;
  /** Move o cursor sem armar nada — e sem desarmar o que já está armado. */
  irPara: (segundos: number) => void;
  /** Ligar no `onSeeking` do `<video>`: a mão do operador cancela a parada. */
  aoBuscar: () => void;
}

export function useParadaNoFim(video: RefObject<HTMLVideoElement | null>): Navegacao {
  const fim = useRef<number | null>(null);
  const quadro = useRef(0);
  // Levantada logo antes de mexermos no cursor e baixada pelo `seeking` que ela
  // mesma provoca — é o que distingue o nosso seek do dele.
  const seekNosso = useRef(false);

  const desarmar = useCallback(() => {
    fim.current = null;
    cancelAnimationFrame(quadro.current);
  }, []);

  const vigiar = useCallback(() => {
    const el = video.current;
    if (!el || fim.current === null) return;
    if (alcancouOFim(fim.current, el.currentTime)) {
      el.pause();
      desarmar();
      return;
    }
    quadro.current = requestAnimationFrame(vigiar);
  }, [video, desarmar]);

  const tocarAte = useCallback(
    (inicioSeg: number, fimSeg: number) => {
      const el = video.current;
      if (!el) return;
      seekNosso.current = true;
      el.currentTime = inicioSeg;
      fim.current = fimSeg;
      void el.play();
      cancelAnimationFrame(quadro.current);
      quadro.current = requestAnimationFrame(vigiar);
    },
    [video, vigiar],
  );

  const irPara = useCallback(
    (segundos: number) => {
      const el = video.current;
      if (!el) return;
      seekNosso.current = true;
      el.currentTime = segundos;
    },
    [video],
  );

  const aoBuscar = useCallback(() => {
    if (!desarmaNoSeek(seekNosso.current)) {
      seekNosso.current = false;
      return;
    }
    desarmar();
  }, [desarmar]);

  useEffect(() => () => cancelAnimationFrame(quadro.current), []);

  return { tocarAte, irPara, aoBuscar };
}
