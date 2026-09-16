import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { alcancouOFim, desarmaNoSeek, proximaJanela, type Janela } from './paradaNoFim';

// D-539: a ponte entre a regra de parada e o `<video>`.
//
// A vigília roda em `requestAnimationFrame`, e não no `timeupdate` do elemento.
// O `timeupdate` dispara a cada ~250ms, o que num vídeo a 1× significa passar
// até um quarto de segundo do fim antes de perceber — tempo de sobra para o
// primeiro quadro do assunto seguinte aparecer. O rAF acerta o quadro, custa
// nada enquanto está desarmado (não há loop) e para sozinho ao pausar.

interface Navegacao {
  /**
   * Vai para o início e para sozinho no fim — de UMA ou de N janelas do bruto.
   *
   * D-604: era `tocarAte(inicio, fim)`, e passou a receber a lista. Uma janela
   * só se comporta exatamente como antes, que é o caso normal; com N ela pula o
   * que ficou fora da colagem.
   *
   * As duas formas NÃO convivem de propósito: `tocarAte` era caso especial desta
   * (uma janela), e manter os dois convidaria a chamar o antigo num short colado
   * — que tocaria o buraco inteiro sem nada avisando.
   */
  tocarColagem: (janelas: Janela[]) => void;
  /** Move o cursor sem armar nada — e sem desarmar o que já está armado. */
  irPara: (segundos: number) => void;
  /** Ligar no `onSeeking` do `<video>`: a mão do operador cancela a parada. */
  aoBuscar: () => void;
}

export function useParadaNoFim(video: RefObject<HTMLVideoElement | null>): Navegacao {
  const fim = useRef<number | null>(null);
  const quadro = useRef(0);
  // D-604: a colagem em curso e em qual janela dela estamos. Vazio = não há
  // colagem, e o fim é fim — o comportamento da D-539.
  const colagem = useRef<Janela[]>([]);
  const janelaAtual = useRef(0);
  // Levantada logo antes de mexermos no cursor e baixada pelo `seeking` que ela
  // mesma provoca — é o que distingue o nosso seek do dele.
  const seekNosso = useRef(false);

  const desarmar = useCallback(() => {
    fim.current = null;
    colagem.current = [];
    janelaAtual.current = 0;
    cancelAnimationFrame(quadro.current);
  }, []);

  const vigiar = useCallback(() => {
    const el = video.current;
    if (!el || fim.current === null) return;
    if (alcancouOFim(fim.current, el.currentTime)) {
      // D-604: num short colado, o fim de uma janela é a DEIXA para a próxima.
      // Pausar aqui faria o operador achar que o short acabou no primeiro
      // buraco, quando ele tem os outros segmentos por vir.
      const proxima = proximaJanela(colagem.current, janelaAtual.current);
      if (proxima) {
        janelaAtual.current += 1;
        fim.current = proxima.fim;
        // O seek é NOSSO: sem levantar a bandeira, o `seeking` que ele provoca
        // desarmaria a parada e o vídeo seguiria vida afora no segundo pulo.
        seekNosso.current = true;
        el.currentTime = proxima.inicio;
        quadro.current = requestAnimationFrame(vigiar);
        return;
      }
      el.pause();
      desarmar();
      return;
    }
    quadro.current = requestAnimationFrame(vigiar);
  }, [video, desarmar]);

  const tocarColagem = useCallback(
    (janelas: Janela[]) => {
      const el = video.current;
      if (!el || janelas.length === 0) return;
      colagem.current = janelas;
      janelaAtual.current = 0;
      seekNosso.current = true;
      el.currentTime = janelas[0].inicio;
      fim.current = janelas[0].fim;
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

  return { tocarColagem, irPara, aoBuscar };
}
