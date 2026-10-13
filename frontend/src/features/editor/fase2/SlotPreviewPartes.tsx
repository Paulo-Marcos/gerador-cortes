import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { limitar } from '@/lib/limitar';
import type { YoutubeSharedRect } from '@/shared/palco/youtubeLayout';

/**
 * As partes do `SlotPreview` (posicionamentoControls): o quadro parado do
 * vídeo recortado, o retângulo arrastável e o arraste em si. Saíram para cá
 * quando o preview ganhou o terceiro retângulo, o dos cards (D-904).
 */

/** O arraste de um retângulo no palco 1920x1080 escalado para o container. */
export function useArrastarRetangulo<K extends string>({
  frameRef,
  rectDe,
  onChange,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  rectDe: (key: K) => YoutubeSharedRect;
  onChange: (key: K, rect: YoutubeSharedRect) => void;
}) {
  const dragRef = useRef<{ key: K; startX: number; startY: number; x: number; y: number } | null>(
    null,
  );
  const [dragKey, setDragKey] = useState<K | null>(null);

  const startDrag = (key: K) => (event: PointerEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const rect = rectDe(key);
    dragRef.current = { key, startX: event.clientX, startY: event.clientY, x: rect.x, y: rect.y };
    setDragKey(key);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = ((event.clientX - drag.startX) / bounds.width) * 1920;
    const dy = ((event.clientY - drag.startY) / bounds.height) * 1080;
    const rect = rectDe(drag.key);
    const nextX = limitar(Math.round(drag.x + dx), 0, 1920 - rect.w);
    const nextY = limitar(Math.round(drag.y + dy), 0, 1080 - rect.h);
    if (nextX !== rect.x || nextY !== rect.y) {
      onChange(drag.key, { ...rect, x: nextX, y: nextY });
    }
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragKey(null);
  };

  return { dragKey, startDrag, onMove, endDrag };
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
}: {
  rect: YoutubeSharedRect;
  label: string;
  color: string;
  selected: boolean;
  dragging: boolean;
  /** D-904: a zona automática dos cards só se vê; não se arrasta. */
  draggable?: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="presentation"
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? onPointerUp : undefined}
      onPointerCancel={draggable ? onPointerCancel : undefined}
      className={cn(
        'absolute flex flex-col items-stretch justify-end overflow-hidden border-2 transition-colors',
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
    </div>
  );
}
