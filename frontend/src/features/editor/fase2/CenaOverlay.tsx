/**
 * Componente público CenaOverlay — mede o container e escala o palco 1920×1080.
 *
 * FACHADA (E-006): as cenas e o kit de estilo foram fatiados em
 * `cenaOverlay/scenes` e `cenaOverlay/sceneKit`. O export `CenaOverlay` e sua
 * assinatura permanecem idênticos — nenhum importador muda.
 * Port fiel do Angular CenaPreviewComponent → React (mesmas cores/tamanhos do
 * Remotion). Ao alterar uma cena no video-renderer, atualizar `scenes` também.
 */
import { useEffect, useRef, useState } from 'react';
import type { CenaRemotion } from '@/types/models';

import { CenaStage } from './cenaOverlay/scenes';
import { STAGE_H, STAGE_W } from './cenaOverlay/sceneKit';

interface Props {
  cena: CenaRemotion | null;
}

export function CenaOverlay({ cena }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!cena) return null;

  const scale = size.w > 0 && size.h > 0 ? Math.min(size.w / STAGE_W, size.h / STAGE_H) : 1;
  const offsetX = (size.w - STAGE_W * scale) / 2;
  const offsetY = (size.h - STAGE_H * scale) / 2;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
        overflow: 'hidden',
      }}
    >
      <CenaStage cena={cena} scale={scale} offsetX={offsetX} offsetY={offsetY} />
    </div>
  );
}
