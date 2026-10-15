import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { limitar } from '@/lib/limitar';
import type { YoutubeSharedRect } from '@/shared/palco/youtubeLayout';

/**
 * As partes do `SlotPreview` (posicionamentoControls): o quadro parado do
 * vídeo recortado, o retângulo arrastável e o arraste em si. Saíram para cá
 * quando o preview ganhou o terceiro retângulo, o dos cards (D-904).
 */

/** Como o retângulo cresce no canto: o padrão é livre; a tela mantém a proporção. */
export type Redimensionar<K> = (key: K, inicial: YoutubeSharedRect, w: number, h: number) => YoutubeSharedRect;

const LADO_MINIMO = 80;

/**
 * D-927: no palco, a tela e a facecam crescem mantendo a proporção do encaixe
 * (o recorte não deforma); a zona dos cards cresce livre.
 */
export function redimensionarNoPalco(key: string, inicial: YoutubeSharedRect, w: number, h: number): YoutubeSharedRect {
  if (key === 'zona_card') return { ...inicial, w, h };
  const proporcao = inicial.h / inicial.w;
  const largura = Math.min(w, Math.floor((1080 - inicial.y) / proporcao));
  return { ...inicial, w: largura, h: Math.round(largura * proporcao) };
}

/**
 * O arraste de um retângulo no palco 1920x1080 escalado para o container:
 * mover (o corpo) e, desde a D-927, redimensionar (a alça do canto).
 */
export function useArrastarRetangulo<K extends string>({
  frameRef,
  rectDe,
  onChange,
  redimensionar,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  rectDe: (key: K) => YoutubeSharedRect;
  onChange: (key: K, rect: YoutubeSharedRect) => void;
  redimensionar?: Redimensionar<K>;
}) {
  const dragRef = useRef<{ key: K; modo: 'mover' | 'redimensionar'; startX: number; startY: number; inicial: YoutubeSharedRect } | null>(null);
  const [dragKey, setDragKey] = useState<K | null>(null);

  const comecar = (key: K, modo: 'mover' | 'redimensionar') => (event: PointerEvent<HTMLElement>) => {
    if (!frameRef.current) return;
    dragRef.current = { key, modo, startX: event.clientX, startY: event.clientY, inicial: rectDe(key) };
    setDragKey(key);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const onMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = ((event.clientX - drag.startX) / bounds.width) * 1920;
    const dy = ((event.clientY - drag.startY) / bounds.height) * 1080;
    const { inicial } = drag;
    const atual = rectDe(drag.key);
    let proximo: YoutubeSharedRect;
    if (drag.modo === 'mover') {
      proximo = {
        ...atual,
        x: limitar(Math.round(inicial.x + dx), 0, 1920 - atual.w),
        y: limitar(Math.round(inicial.y + dy), 0, 1080 - atual.h),
      };
    } else {
      const w = limitar(Math.round(inicial.w + dx), LADO_MINIMO, 1920 - inicial.x);
      const h = limitar(Math.round(inicial.h + dy), LADO_MINIMO, 1080 - inicial.y);
      proximo = redimensionar ? redimensionar(drag.key, inicial, w, h) : { ...inicial, w, h };
    }
    if (proximo.x !== atual.x || proximo.y !== atual.y || proximo.w !== atual.w || proximo.h !== atual.h) {
      onChange(drag.key, proximo);
    }
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragKey(null);
  };

  return {
    dragKey,
    startDrag: (key: K) => comecar(key, 'mover'),
    startResize: (key: K) => comecar(key, 'redimensionar'),
    onMove,
    endDrag,
  };
}

/** A alça do canto inferior direito: arrastar redimensiona (D-927). */
export function AlcaDeTamanho({
  rotulo,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  rotulo: string;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
}) {
  return (
    <span
      role="presentation"
      aria-label={`Redimensionar ${rotulo}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute bottom-0 right-0 h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border-2 border-[var(--wb-bg-card)] bg-[var(--wb-accent)]"
    />
  );
}

/** Frame estatico do video crop-positioned para o SlotPreview. */
export function CroppedStill({
  videoSrc,
  currentTime,
  crop,
  renderW,
  renderH,
}: {
  videoSrc: string;
  currentTime: number;
  crop: YoutubeSharedRect;
  renderW: number;
  renderH: number;
}) {
  const scale = Math.min(renderW / crop.w, renderH / crop.h);
  return (
    <video
      src={videoSrc}
      muted
      preload="metadata"
      onLoadedMetadata={(event) => {
        try {
          event.currentTarget.currentTime = Math.max(0, currentTime);
        } catch {
          // ignore
        }
      }}
      style={{
        position: 'absolute',
        left: -crop.x * scale,
        top: -crop.y * scale,
        width: 1920 * scale,
        height: 1080 * scale,
        maxWidth: 'none',
        maxHeight: 'none',
        objectFit: 'fill',
      }}
    />
  );
}

export function SlotDragOverlay({
  rect,
  label,
  color,
  selected,
  dragging,
  draggable = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onResizeDown,
}: {
  rect: YoutubeSharedRect;
  label: string;
  color: string;
  selected: boolean;
  dragging: boolean;
  /** D-904: a zona automática dos cards só se vê; não se arrasta. */
  draggable?: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  /** D-927: a alça do canto, quando o retângulo pode crescer. */
  onResizeDown?: (event: PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      role="presentation"
      data-retangulo={label}
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? onPointerUp : undefined}
      onPointerCancel={draggable ? onPointerCancel : undefined}
      className={cn(
        'absolute flex flex-col items-stretch justify-end border-2 transition-colors',
        !draggable
          ? 'pointer-events-none border-dashed'
          : dragging
            ? 'cursor-grabbing'
            : 'cursor-grab',
      )}
      style={{
        left: `${(rect.x / 1920) * 100}%`,
        top: `${(rect.y / 1080) * 100}%`,
        width: `${(rect.w / 1920) * 100}%`,
        height: `${(rect.h / 1080) * 100}%`,
        borderColor: selected ? color : 'transparent',
        background: selected ? `color-mix(in oklch, ${color} 12%, transparent)` : 'transparent',
      }}
    >
      {selected && (
        <span
          className="pointer-events-none m-1 self-start rounded-sm px-1 py-0.5 font-code text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--wb-accent-fg)]"
          style={{ background: color }}
        >
          {label} {rect.w}×{rect.h}
        </span>
      )}
      {selected && draggable && onResizeDown && (
        <AlcaDeTamanho rotulo={label} onPointerDown={onResizeDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
      )}
    </div>
  );
}
