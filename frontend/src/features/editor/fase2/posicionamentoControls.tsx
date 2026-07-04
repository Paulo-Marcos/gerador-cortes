/**
 * Controles compartilhados de posicionamento (F-048).
 *
 * Componentes que editam um `YoutubeSharedConfig` (crops/slots/telas) usados
 * pelo `PosicionamentoModal`. Extraidos de `YoutubeLayoutPanel.tsx` quando
 * o painel inline foi substituido pelo modal.
 */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crop, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type {
  YoutubeBackgroundId,
  YoutubePlaca,
  YoutubeSharedConfig,
  YoutubeSharedRect,
  YoutubeSharedScreenCount,
} from './youtubeLayout';
import { YoutubeBackground } from './youtubeBackgrounds';
import {
  ImageFrame,
  SPEAKER_LABEL_GAP_FROM_IMAGE,
  SPEAKER_LABEL_HEIGHT,
  SpeakerLabelOverlay,
  StageChrome,
} from './youtubeChrome';

export type SharedRectKey = Exclude<keyof YoutubeSharedConfig, 'telas'>;
export type CropRectKey = 'crop_facecam' | 'crop_tela';

export const RECT_LABEL: Record<SharedRectKey, string> = {
  crop_facecam: 'Menor recorte',
  slot_facecam: 'Menor encaixe',
  crop_tela: 'Maior recorte',
  slot_tela: 'Maior encaixe',
};

const RECT_LABEL_SINGLE: Partial<Record<SharedRectKey, string>> = {
  crop_tela: 'Recorte',
  slot_tela: 'Encaixe',
};

export const RECT_KEYS_TWO_SCREENS: SharedRectKey[] = [
  'crop_facecam',
  'slot_facecam',
  'crop_tela',
  'slot_tela',
];
export const RECT_KEYS_ONE_SCREEN: SharedRectKey[] = ['crop_tela', 'slot_tela'];

export function getRectLabel(key: SharedRectKey, telas: YoutubeSharedScreenCount) {
  return telas === 1 ? (RECT_LABEL_SINGLE[key] ?? RECT_LABEL[key]) : RECT_LABEL[key];
}

export function isCropRectKey(key: SharedRectKey): key is CropRectKey {
  return key === 'crop_facecam' || key === 'crop_tela';
}

export function isFacecamRectKey(key: SharedRectKey) {
  return key === 'crop_facecam' || key === 'slot_facecam';
}

export function resizeSlotForCrop(
  slot: YoutubeSharedRect,
  oldCrop: YoutubeSharedRect,
  newCrop: YoutubeSharedRect,
): YoutubeSharedRect {
  const scale = Math.max(0.01, slot.w / Math.max(1, oldCrop.w));
  return {
    ...slot,
    w: Math.max(1, Math.round(newCrop.w * scale)),
    h: Math.max(1, Math.round(newCrop.h * scale)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): YoutubeSharedRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    w: Math.max(1, Math.abs(end.x - start.x)),
    h: Math.max(1, Math.abs(end.y - start.y)),
  };
}

function rectToStyle(rect: YoutubeSharedRect) {
  return {
    left: `${(rect.x / 1920) * 100}%`,
    top: `${(rect.y / 1080) * 100}%`,
    width: `${(rect.w / 1920) * 100}%`,
    height: `${(rect.h / 1080) * 100}%`,
  };
}

export function SharedScreenCountToggle({
  value,
  onChange,
}: {
  value: YoutubeSharedScreenCount;
  onChange: (value: YoutubeSharedScreenCount) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2 py-1.5">
      <span className="flex min-w-0 flex-1 font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        Telas
      </span>
      <div className="inline-flex items-center overflow-hidden rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
        {([1, 2] as const).map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => onChange(count)}
            aria-pressed={value === count}
            className={cn(
              'h-6 px-2.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] transition-colors',
              value === count
                ? 'bg-[var(--wb-accent)] text-white'
                : 'bg-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
            )}
          >
            {count} tela{count === 1 ? '' : 's'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModePicker({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-[30px] rounded-[var(--radius-xs)] border px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors',
        active
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
          : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
    >
      {label}
    </button>
  );
}

function IconControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <Button type="button" variant="outline" size="icon-sm" onClick={onClick}>
        {children}
      </Button>
    </Tooltip>
  );
}

export function SharedRectEditor({
  className,
  rect,
  baseRect,
  onChange,
  onChangeDraft,
  onCommit,
}: {
  className?: string;
  rect: YoutubeSharedRect;
  baseRect?: YoutubeSharedRect;
  onChange: (rect: YoutubeSharedRect) => void;
  onChangeDraft: (rect: YoutubeSharedRect) => void;
  onCommit: () => void;
}) {
  const scalePercent = baseRect ? Math.round((rect.w / baseRect.w) * 100) : 100;
  const setValueDraft = (field: keyof YoutubeSharedRect, value: number) => {
    onChangeDraft({ ...rect, [field]: value });
  };
  const move = (dx: number, dy: number) => onChange({ ...rect, x: rect.x + dx, y: rect.y + dy });
  const setScaleDraft = (percent: number) => {
    if (!baseRect) return;
    const scale = Math.max(1, percent) / 100;
    onChangeDraft({
      ...rect,
      w: Math.max(1, Math.round(baseRect.w * scale)),
      h: Math.max(1, Math.round(baseRect.h * scale)),
    });
  };
  const setScale = (percent: number) => {
    if (!baseRect) return;
    const scale = Math.max(1, percent) / 100;
    onChange({
      ...rect,
      w: Math.max(1, Math.round(baseRect.w * scale)),
      h: Math.max(1, Math.round(baseRect.h * scale)),
    });
  };
  const resize = (dw: number, dh: number) =>
    onChange({ ...rect, w: Math.max(1, rect.w + dw), h: Math.max(1, rect.h + dh) });

  return (
    <div className={className}>
      <div className={baseRect ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
        {(['x', 'y'] as const).map((field) => (
          <label
            key={field}
            className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]"
          >
            {field}
            <Input
              type="number"
              step="1"
              value={rect[field]}
              onChange={(event) => setValueDraft(field, Number(event.target.value))}
              onBlur={onCommit}
              className="h-7 font-code text-[11px]"
            />
          </label>
        ))}
        {baseRect ? (
          <label className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            escala
            <Input
              type="number"
              step="1"
              value={scalePercent}
              onChange={(event) => setScaleDraft(Number(event.target.value))}
              onBlur={onCommit}
              className="h-7 font-code text-[11px]"
            />
          </label>
        ) : (
          (['w', 'h'] as const).map((field) => (
            <label
              key={field}
              className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]"
            >
              {field}
              <Input
                type="number"
                step="1"
                value={rect[field]}
                onChange={(event) => setValueDraft(field, Number(event.target.value))}
                onBlur={onCommit}
                className="h-7 font-code text-[11px]"
              />
            </label>
          ))
        )}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <IconControl label="Mover para cima" onClick={() => move(0, -10)}>
            <ArrowUp size={13} />
          </IconControl>
          <span />
          <IconControl label="Mover para esquerda" onClick={() => move(-10, 0)}>
            <ArrowLeft size={13} />
          </IconControl>
          <IconControl label="Mover para baixo" onClick={() => move(0, 10)}>
            <ArrowDown size={13} />
          </IconControl>
          <IconControl label="Mover para direita" onClick={() => move(10, 0)}>
            <ArrowRight size={13} />
          </IconControl>
        </div>
        <div className="h-9 w-px bg-[var(--wb-border-soft)]" />
        {baseRect ? (
          <div className="grid grid-cols-2 gap-1">
            <IconControl label="Diminuir tamanho" onClick={() => setScale(scalePercent - 5)}>
              <Minus size={13} />
            </IconControl>
            <IconControl label="Aumentar tamanho" onClick={() => setScale(scalePercent + 5)}>
              <Plus size={13} />
            </IconControl>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => resize(-10, 0)}>
              W-
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => resize(10, 0)}>
              W+
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => resize(0, -10)}>
              H-
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => resize(0, 10)}>
              H+
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Preview do "encaixe" (slot) no palco 1920x1080 — F-048.
 *
 * Renderiza o palco real (fundo editorial + chrome + placa + frames com o
 * video bruto recortado) e sobrepoe um overlay "drag" no slot selecionado.
 * Permite arrastar para mover, mantendo a previa visual fiel ao render.
 *
 * Tecnica: o palco interno usa coords nativas 1920x1080 dentro de um
 * container `transform: scale(...)` que cabe no espaco disponivel — assim
 * todos os componentes do palco (que assumem coords absolutas em 1920x1080)
 * funcionam sem mudanca.
 */
export function SlotPreview({
  className,
  config,
  rectKey,
  videoSrc,
  currentTime,
  fundo,
  placa,
  onChangeSlot,
}: {
  className?: string;
  config: YoutubeSharedConfig;
  rectKey: SharedRectKey;
  videoSrc?: string;
  currentTime: number;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  onChangeSlot: (key: 'slot_facecam' | 'slot_tela', rect: YoutubeSharedRect) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const dragRef = useRef<{
    key: 'slot_facecam' | 'slot_tela';
    startX: number;
    startY: number;
    startSlotX: number;
    startSlotY: number;
  } | null>(null);
  const [dragKey, setDragKey] = useState<'slot_facecam' | 'slot_tela' | null>(null);

  // Calcula a escala que faz o palco 1920x1080 caber no container 16:9.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      setStageScale(rect.width / 1920);
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasFacecam = config.telas !== 1;
  const isSelected = (key: 'slot_facecam' | 'slot_tela') =>
    rectKey === key ||
    (key === 'slot_facecam' && rectKey === 'crop_facecam') ||
    (key === 'slot_tela' && rectKey === 'crop_tela');

  const telaScale = Math.min(
    config.slot_tela.w / config.crop_tela.w,
    config.slot_tela.h / config.crop_tela.h,
  );
  const telaW = config.crop_tela.w * telaScale;
  const telaH = config.crop_tela.h * telaScale;
  const faceScale = Math.min(
    config.slot_facecam.w / config.crop_facecam.w,
    config.slot_facecam.h / config.crop_facecam.h,
  );
  const faceW = config.crop_facecam.w * faceScale;
  const faceH = config.crop_facecam.h * faceScale;

  const startDrag =
    (key: 'slot_facecam' | 'slot_tela') => (event: PointerEvent<HTMLDivElement>) => {
      const bounds = frameRef.current?.getBoundingClientRect();
      if (!bounds) return;
      dragRef.current = {
        key,
        startX: event.clientX,
        startY: event.clientY,
        startSlotX: config[key].x,
        startSlotY: config[key].y,
      };
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
    const slot = config[drag.key];
    const nextX = clamp(Math.round(drag.startSlotX + dx), 0, 1920 - slot.w);
    const nextY = clamp(Math.round(drag.startSlotY + dy), 0, 1080 - slot.h);
    if (nextX !== slot.x || nextY !== slot.y) {
      onChangeSlot(drag.key, { ...slot, x: nextX, y: nextY });
    }
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragKey(null);
  };

  const temPlaca = Boolean(placa && (placa.nome || placa.papel));

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 font-code text-[10px] text-[var(--wb-text-dim)]">
        Pré-visualização do palco — arraste o retângulo destacado para mover o encaixe.
      </div>
      <div
        ref={frameRef}
        className="relative aspect-video overflow-hidden rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[#0c0e12]"
      >
        {/* Palco em coords 1920x1080 escalado p/ caber. Pointer-events
            none aqui pra nao bloquear o SlotBox overlay. */}
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${stageScale})`,
            transformOrigin: '0 0',
          }}
        >
          <YoutubeBackground fundo={fundo} />
          <StageChrome />
          <ImageFrame
            left={config.slot_tela.x}
            top={config.slot_tela.y}
            width={telaW}
            height={telaH}
            chromeOpts={{ radius: 30, chamferTR: 80, chamferBR: 44, offset: 12 }}
            outlineScale={0.3}
          >
            {videoSrc ? (
              <CroppedStill
                videoSrc={videoSrc}
                currentTime={currentTime}
                crop={config.crop_tela}
                renderW={telaW}
                renderH={telaH}
              />
            ) : (
              <div className="h-full w-full bg-black" />
            )}
          </ImageFrame>
          {hasFacecam && (
            <ImageFrame
              left={config.slot_facecam.x}
              top={config.slot_facecam.y}
              width={faceW}
              height={faceH}
            >
              {videoSrc ? (
                <CroppedStill
                  videoSrc={videoSrc}
                  currentTime={currentTime}
                  crop={config.crop_facecam}
                  renderW={faceW}
                  renderH={faceH}
                />
              ) : (
                <div className="h-full w-full bg-black" />
              )}
            </ImageFrame>
          )}
          {temPlaca && (
            <SpeakerLabelOverlay
              left={config.slot_tela.x}
              top={config.slot_tela.y - SPEAKER_LABEL_HEIGHT - SPEAKER_LABEL_GAP_FROM_IMAGE}
              nome={placa.nome}
              papel={placa.papel}
            />
          )}
        </div>

        {/* Overlay clicavel/arrastavel para cada slot — em coords % para
            casar visualmente com o palco escalado. */}
        <SlotDragOverlay
          rect={config.slot_tela}
          label="Tela"
          color="var(--wb-accent)"
          selected={isSelected('slot_tela')}
          dragging={dragKey === 'slot_tela'}
          onPointerDown={startDrag('slot_tela')}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {hasFacecam && (
          <SlotDragOverlay
            rect={config.slot_facecam}
            label="Facecam"
            color="var(--wb-info)"
            selected={isSelected('slot_facecam')}
            dragging={dragKey === 'slot_facecam'}
            onPointerDown={startDrag('slot_facecam')}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
      </div>
    </div>
  );
}

/** Frame estatico do video crop-positioned para o SlotPreview. */
function CroppedStill({
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

function SlotDragOverlay({
  rect,
  label,
  color,
  selected,
  dragging,
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
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="presentation"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        'absolute flex flex-col items-stretch justify-end overflow-hidden border-2 transition-colors',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
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
          className="pointer-events-none m-1 self-start rounded-sm px-1 py-0.5 font-code text-[9px] font-bold uppercase tracking-[0.04em] text-white"
          style={{ background: color }}
        >
          {label} {rect.w}×{rect.h}
        </span>
      )}
    </div>
  );
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
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<YoutubeSharedRect | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(currentTime)) return;
    const nextTime = Math.max(0, currentTime);
    if (video.readyState > 0 && Math.abs(video.currentTime - nextTime) > 0.25) {
      try {
        video.currentTime = nextTime;
      } catch {
        // Browser ainda pode estar resolvendo o redirect do video.
      }
    }
  }, [currentTime, videoSrc]);

  const activeRect = draftRect ?? rect;

  const pointToVideo = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: clamp(Math.round(((event.clientX - bounds.left) / bounds.width) * 1920), 0, 1920),
      y: clamp(Math.round(((event.clientY - bounds.top) / bounds.height) * 1080), 0, 1080),
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingEnabled) return;
    const point = pointToVideo(event);
    if (!point) return;
    dragStartRef.current = point;
    setDraftRect({ x: point.x, y: point.y, w: 1, h: 1 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingEnabled || !dragStartRef.current) return;
    const point = pointToVideo(event);
    if (!point) return;
    setDraftRect(rectFromPoints(dragStartRef.current, point));
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingEnabled || !dragStartRef.current) return;
    const point = pointToVideo(event);
    const finalRect = point ? rectFromPoints(dragStartRef.current, point) : draftRect;
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraftRect(null);
    if (finalRect && finalRect.w >= 4 && finalRect.h >= 4) {
      onChange(finalRect);
    }
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Button
          type="button"
          variant={drawingEnabled ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleDrawing}
        >
          <Crop size={13} />
          Desenhar
        </Button>
        <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
          {rect.x},{rect.y} {rect.w}x{rect.h}
        </span>
      </div>
      <div
        ref={frameRef}
        role="presentation"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className={[
          'relative aspect-video overflow-hidden rounded-[var(--radius-sm)] border bg-black',
          drawingEnabled
            ? 'cursor-crosshair border-[var(--wb-accent)]'
            : 'border-[var(--wb-border-soft)]',
        ].join(' ')}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          preload="metadata"
          className="h-full w-full object-fill"
          onLoadedMetadata={() => {
            if (!videoRef.current) return;
            try {
              videoRef.current.currentTime = Math.max(0, currentTime);
            } catch {
              // Sem efeito; o proximo tick de currentTime sincroniza.
            }
          }}
        />
        <div
          className="pointer-events-none absolute border-2 border-sky-300 bg-sky-300/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]"
          style={rectToStyle(activeRect)}
        />
      </div>
    </div>
  );
}
