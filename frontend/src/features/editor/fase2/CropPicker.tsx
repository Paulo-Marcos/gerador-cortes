import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { limitar } from '@/lib/limitar';
import type { YoutubeSharedRect } from '@/shared/palco/youtubeLayout';
import { Icon } from '@/upgrade/Icon';
import { GuiasNaPrevia } from './guiasDeAlinhamento';
import { SlotDragOverlay, useArrastarRetangulo } from './SlotPreviewPartes';

// O recorte de uma janela sobre o quadro do vídeo no tempo atual. Com
// "Desenhar" ligado, arrastar desenha um recorte novo; desligado (D-928), o
// recorte se move pelo corpo e se redimensiona pela alça, como no palco.
// Saiu de `posicionamentoControls` (D-928).

export function rectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): YoutubeSharedRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.max(1, Math.abs(end.x - start.x)),
    h: Math.max(1, Math.abs(end.y - start.y)),
  };
}

const estiloDe = (rect: YoutubeSharedRect) => ({
  left: `${(rect.x / 1920) * 100}%`,
  top: `${(rect.y / 1080) * 100}%`,
  width: `${(rect.w / 1920) * 100}%`,
  height: `${(rect.h / 1080) * 100}%`,
});

/** Desenhar um retângulo novo arrastando sobre o quadro (o "Desenhar"). */
function useDesenharRecorte(frameRef: RefObject<HTMLDivElement | null>, ligado: boolean, onChange: (rect: YoutubeSharedRect) => void) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [rascunho, setRascunho] = useState<YoutubeSharedRect | null>(null);
  const ponto = (event: PointerEvent<HTMLDivElement>) => {
    const b = frameRef.current?.getBoundingClientRect();
    if (!b) return null;
    return {
      x: limitar(Math.round(((event.clientX - b.left) / b.width) * 1920), 0, 1920),
      y: limitar(Math.round(((event.clientY - b.top) / b.height) * 1080), 0, 1080),
    };
  };
  return {
    rascunho,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      const p = ligado ? ponto(event) : null;
      if (!p) return;
      inicio.current = p;
      setRascunho({ ...p, w: 1, h: 1 });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const p = ligado && inicio.current ? ponto(event) : null;
      if (p && inicio.current) setRascunho(rectFromPoints(inicio.current, p));
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (!ligado || !inicio.current) return;
      const p = ponto(event);
      const final = p ? rectFromPoints(inicio.current, p) : rascunho;
      inicio.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      setRascunho(null);
      if (final && final.w >= 4 && final.h >= 4) onChange(final);
    },
  };
}

export function CropPicker({
  className,
  videoSrc,
  currentTime,
  rect,
  drawingEnabled,
  onToggleDrawing,
  onChange,
}: {
  className?: string;
  videoSrc: string;
  currentTime: number;
  rect: YoutubeSharedRect;
  drawingEnabled: boolean;
  onToggleDrawing: () => void;
  onChange: (rect: YoutubeSharedRect) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const desenho = useDesenharRecorte(frameRef, drawingEnabled, onChange);
  const arraste = useArrastarRetangulo<'recorte'>({ frameRef, rectDe: () => rect, onChange: (_, r) => onChange(r) });
  // Segue o tempo do player: o quadro mostrado é o do instante atual.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(currentTime) || video.readyState === 0) return;
    if (Math.abs(video.currentTime - currentTime) > 0.25) {
      try {
        video.currentTime = Math.max(0, currentTime);
      } catch {
        // o redirect do vídeo ainda pode estar resolvendo
      }
    }
  }, [currentTime, videoSrc]);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Button type="button" variant={drawingEnabled ? 'default' : 'outline'} size="sm" onClick={onToggleDrawing}>
          <Icon name="crop" />
          Desenhar
        </Button>
        <span className="font-code text-[11px] text-[var(--wb-text-dim)]">
          {rect.x},{rect.y} {rect.w}x{rect.h}
        </span>
      </div>
      <div
        ref={frameRef}
        role="presentation"
        onPointerDown={desenho.onPointerDown}
        onPointerMove={desenho.onPointerMove}
        onPointerUp={desenho.onPointerUp}
        onPointerCancel={desenho.onPointerUp}
        className={`relative aspect-video overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--wb-bg-inset)] ${drawingEnabled ? 'cursor-crosshair border-[var(--wb-accent)]' : 'border-[var(--wb-border-soft)]'}`}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          preload="metadata"
          className="h-full w-full object-fill"
          onLoadedMetadata={(e) => {
            try {
              e.currentTarget.currentTime = Math.max(0, currentTime);
            } catch {
              // o próximo tick de currentTime sincroniza
            }
          }}
        />
        <div className="pointer-events-none absolute border-2 border-[var(--wb-info)] shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]" style={estiloDe(desenho.rascunho ?? rect)} />
        {!drawingEnabled && (
          <SlotDragOverlay
            rect={rect}
            label="Recorte"
            color="var(--wb-info)"
            selected
            dragging={arraste.dragKey === 'recorte'}
            onPointerDown={arraste.startDrag('recorte')}
            onResizeDown={arraste.startResize('recorte')}
            onPointerMove={arraste.onMove}
            onPointerUp={arraste.endDrag}
            onPointerCancel={arraste.endDrag}
          />
        )}
        <GuiasNaPrevia guias={arraste.guias} />
      </div>
    </div>
  );
}
