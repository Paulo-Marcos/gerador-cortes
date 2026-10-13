import { useEffect, useRef, type RefObject } from 'react';

import type { PlanoDesenhavel } from './shortsApi';

// D-913: o ECO na prévia do short — a janela principal desfocada, escurecida e
// dessaturada nas faixas em volta das janelas, como o FFmpeg faz no render
// (`_base_do_palco` em `backend/app/infrastructure/render/ffmpeg_short.py`).
//
// Desenha num canvas a 1/4 da resolução e deixa o CSS esticar: o desfoque de
// 10 px ali é o de 40 px no quadro cheio, pelo custo de um dezesseis avos.

/** Espelha `_ECO_REDUCAO`, `_ECO_DESFOQUE`, `_ECO_SATURACAO` e `_ECO_BRILHO` do backend. */
export const ECO_REDUCAO = 4;
export const FILTRO_DO_ECO = 'blur(10px) saturate(0.6) brightness(0.35)';

type Retangulo = { x: number; y: number; w: number; h: number };

/** A janela que mais ocupa o quadro: o eco dela emenda com o que o olho já vê. */
export function recortePrincipal(plano: PlanoDesenhavel): PlanoDesenhavel['recortes'][number] | undefined {
  return [...plano.recortes].sort(
    (a, b) => b.recorta.w * b.recorta.h - a.recorta.w * a.recorta.h,
  )[0];
}

/** Onde desenhar a origem para COBRIR o quadro inteiro, centralizada. */
export function cobrir(origem: Retangulo, largura: number, altura: number): Retangulo {
  const escala = Math.max(largura / origem.w, altura / origem.h);
  const w = origem.w * escala;
  const h = origem.h * escala;
  return { x: (largura - w) / 2, y: (altura - h) / 2, w, h };
}

export function EcoDaPrevia({
  plano,
  video,
}: {
  plano: PlanoDesenhavel;
  video: RefObject<HTMLVideoElement | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const largura = Math.round(plano.canvas.largura / ECO_REDUCAO);
  const altura = Math.round(plano.canvas.altura / ECO_REDUCAO);

  useEffect(() => {
    const tela = canvas.current;
    const ctx = tela?.getContext('2d');
    const principal = recortePrincipal(plano);
    if (!tela || !ctx || !principal) return;
    let vivo = true;
    const desenhar = () => {
      if (!vivo) return;
      requestAnimationFrame(desenhar);
      const fonte = video.current;
      if (!fonte || fonte.readyState < 2) return;
      const { origem } = principal;
      const destino = cobrir(origem, tela.width, tela.height);
      ctx.filter = FILTRO_DO_ECO;
      ctx.drawImage(fonte, origem.x, origem.y, origem.w, origem.h, destino.x, destino.y, destino.w, destino.h);
    };
    requestAnimationFrame(desenhar);
    return () => {
      vivo = false;
    };
  }, [plano, video]);

  return (
    <canvas
      ref={canvas}
      width={largura}
      height={altura}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
