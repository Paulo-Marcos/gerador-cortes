import { useEffect, useRef, type RefObject } from 'react';
import type { PlanoDesenhavel } from './shortsApi';

// E-036/D-489: o palco desenhado ao vivo, como o arquivo vai sair.
//
// Até aqui a prévia mostrava o recorte 9:16 do quadro cru com a legenda por
// cima — ou seja, mostrava o que o short DEIXOU de ser quando o palco entrou.
//
// ## Por que canvas, e não um Remotion Player
//
// O palco é composto por FFMPEG, não por Remotion. Montar uma composição
// Remotion equivalente criaria uma SEGUNDA implementação da geometria, e a
// prévia passaria a poder discordar do arquivo sem nada quebrar — o risco que
// este épico inteiro existe para evitar (e que a máscara da D-475 já custou
// oito testes para apenas *guardar*).
//
// O `drawImage` do canvas tem exatamente a semântica do crop + scale + overlay
// do ffmpeg: retângulo de origem, retângulo de destino, área de clip. Então o
// backend manda os três números por recorte e a tela só os aplica. A conta
// continua sendo uma só, no domínio.
//
// A camada de legenda continua sendo do Remotion e é desenhada por cima em DOM
// (`LegendaPrevia`), que já usa a função de agrupamento real do render.

interface Props {
  plano: PlanoDesenhavel;
  /** O player que o operador está scrubbing — a fonte dos quadros. */
  video: RefObject<HTMLVideoElement | null>;
  children?: React.ReactNode;
}

export function PalcoPrevia({ plano, video, children }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tela = canvas.current;
    const ctx = tela?.getContext('2d');
    if (!tela || !ctx) return;

    let vivo = true;

    const desenhar = () => {
      if (!vivo) return;
      requestAnimationFrame(desenhar);

      const fonte = video.current;
      // `readyState < 2` = ainda não há quadro decodificado. Desenhar aqui
      // levanta InvalidStateError em alguns navegadores e pinta lixo nos
      // outros.
      if (!fonte || fonte.readyState < 2) return;

      ctx.fillStyle = plano.fundo.replace('0x', '#');
      ctx.fillRect(0, 0, tela.width, tela.height);

      for (const recorte of plano.recortes) {
        const { origem, destino, recorta } = recorte;
        ctx.save();
        // O clip é o que faz o excesso do COBRIR ficar de fora — o destino
        // começa fora do slot de propósito, exatamente como no filtergraph.
        ctx.beginPath();
        ctx.rect(recorta.x, recorta.y, recorta.w, recorta.h);
        ctx.clip();
        ctx.drawImage(
          fonte,
          origem.x,
          origem.y,
          origem.w,
          origem.h,
          destino.x,
          destino.y,
          destino.w,
          destino.h,
        );
        ctx.restore();
      }

      // D-501: a moldura por CIMA de tudo, como no ffmpeg — ela é a assinatura
      // do canal, e conteúdo passando por baixo dela quebraria a borda.
      for (const faixa of plano.faixas ?? []) {
        ctx.fillStyle = faixa.cor;
        ctx.fillRect(faixa.x, faixa.y, faixa.w, faixa.h);
      }
    };

    requestAnimationFrame(desenhar);
    return () => {
      vivo = false;
    };
  }, [plano, video]);

  return (
    <div
      // `h-full w-auto` + aspectRatio: a altura vem da linha (que o player
      // define) e a largura sai da proporcao. Sem a altura definida, um
      // contentor que so tem aspect-ratio colapsa para largura zero.
      className="relative h-full w-auto overflow-hidden rounded-[10px] bg-black"
      // O container é um container de consulta para a legenda se dimensionar
      // em `cqw`, como faz sobre a máscara.
      style={{
        aspectRatio: `${plano.canvas.largura} / ${plano.canvas.altura}`,
        containerType: 'inline-size',
      }}
    >
      <canvas
        ref={canvas}
        width={plano.canvas.largura}
        height={plano.canvas.altura}
        className="absolute inset-0 h-full w-full"
      />
      {children}
    </div>
  );
}
