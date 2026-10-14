/**
 * Controles compartilhados de posicionamento (F-048).
 *
 * Componentes que editam um `YoutubeSharedConfig` (crops/slots/telas) usados
 * pelo `PosicionamentoModal`. Extraidos de `YoutubeLayoutPanel.tsx` quando
 * o painel inline foi substituido pelo modal.
 */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  sharedVerticalCardZone,
  type YoutubeBackgroundId,
  type YoutubePlaca,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
  type YoutubeSharedScreenCount,
} from '@/shared/palco/youtubeLayout';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import { limitar } from '@/lib/limitar';
import { Icon } from '@/upgrade/Icon';
import { PalcoDoSlotPreview } from './PalcoDoSlotPreview';
import { SlotDragOverlay, useArrastarRetangulo } from './SlotPreviewPartes';

export type SharedRectKey = Exclude<keyof YoutubeSharedConfig, 'telas'>;
export type CropRectKey = 'crop_facecam' | 'crop_tela';
/** Os retângulos que se movem no preview do palco. */
export type DragRectKey = 'slot_facecam' | 'slot_tela' | 'zona_card';

export const RECT_LABEL: Record<SharedRectKey, string> = {
  crop_facecam: 'Menor recorte',
  slot_facecam: 'Menor encaixe',
  crop_tela: 'Maior recorte',
  slot_tela: 'Maior encaixe',
  zona_card: 'Cards',
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
  'zona_card',
];
export const RECT_KEYS_ONE_SCREEN: SharedRectKey[] = ['crop_tela', 'slot_tela', 'zona_card'];
// D-904: o FULL posicionado renderiza os cards em tamanho cheio (sem zona);
// o modal de FULL não oferece o retângulo dos cards.
export const RECT_KEYS_FULL: SharedRectKey[] = ['crop_tela', 'slot_tela'];

export function isCardZoneKey(key: SharedRectKey): key is 'zona_card' {
  return key === 'zona_card';
}

/**
 * D-904: o config com a zona dos cards fixada onde a regra automática a
 * colocaria agora — o ponto de partida de quem vai arrastar.
 */
export function comZonaManual(config: YoutubeSharedConfig): YoutubeSharedConfig {
  return { ...config, zona_card: sharedVerticalCardZone(config) };
}

/** D-904: o config de volta à regra automática (a chave some, RN-10). */
export function semZonaManual(config: YoutubeSharedConfig): YoutubeSharedConfig {
  const { zona_card: _omit, ...rest } = config;
  void _omit;
  return rest;
}

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
          ? 'border-[var(--sel-line)] bg-[var(--sel-bg)] text-[var(--sel-ink)]'
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
            <Icon name="arrow-up" />
          </IconControl>
          <span />
          <IconControl label="Mover para esquerda" onClick={() => move(-10, 0)}>
            <Icon name="arrow-left" />
          </IconControl>
          <IconControl label="Mover para baixo" onClick={() => move(0, 10)}>
            <Icon name="arrow-down" />
          </IconControl>
          <IconControl label="Mover para direita" onClick={() => move(10, 0)}>
            <Icon name="arrow-right" />
          </IconControl>
        </div>
        <div className="h-9 w-px bg-[var(--wb-border-soft)]" />
        {baseRect ? (
          <div className="grid grid-cols-2 gap-1">
            <IconControl label="Diminuir tamanho" onClick={() => setScale(scalePercent - 5)}>
              <Icon name="minus" />
            </IconControl>
            <IconControl label="Aumentar tamanho" onClick={() => setScale(scalePercent + 5)}>
              <Icon name="plus" />
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
  palco,
  onChangeSlot,
}: {
  className?: string;
  config: YoutubeSharedConfig;
  rectKey: SharedRectKey;
  videoSrc?: string;
  currentTime: number;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  /** D-921: o palco do canal (o rascunho, no modal); "limpo" troca o desenho. */
  palco?: ComponentesDoPalco;
  onChangeSlot: (key: DragRectKey, rect: YoutubeSharedRect) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [stageScale, setStageScale] = useState(1);
  // D-904: a zona dos cards aparece sempre que está selecionada — tracejada
  // quando é a automática (só para ver onde o card vai cair) e arrastável
  // quando o operador a definiu.
  const zonaCard = sharedVerticalCardZone(config);
  const zonaManual = Boolean(config.zona_card);
  const rectDe = (key: DragRectKey): YoutubeSharedRect =>
    key === 'zona_card' ? zonaCard : config[key];

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
  const isSelected = (key: DragRectKey) =>
    rectKey === key ||
    (key === 'slot_facecam' && rectKey === 'crop_facecam') ||
    (key === 'slot_tela' && rectKey === 'crop_tela');

  const { dragKey, startDrag, onMove, endDrag } = useArrastarRetangulo<DragRectKey>({
    frameRef,
    rectDe,
    onChange: onChangeSlot,
  });

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
          <PalcoDoSlotPreview
            config={config}
            videoSrc={videoSrc}
            currentTime={currentTime}
            fundo={fundo}
            placa={placa}
            palco={palco}
          />
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
        {(zonaManual || isSelected('zona_card')) && (
          <SlotDragOverlay
            rect={zonaCard}
            label={zonaManual ? 'Cards' : 'Cards (automática)'}
            color="var(--wb-warn)"
            selected={isSelected('zona_card')}
            dragging={dragKey === 'zona_card'}
            draggable={zonaManual}
            onPointerDown={startDrag('zona_card')}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
      </div>
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
      x: limitar(Math.round(((event.clientX - bounds.left) / bounds.width) * 1920), 0, 1920),
      y: limitar(Math.round(((event.clientY - bounds.top) / bounds.height) * 1080), 0, 1080),
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
          <Icon name="crop" />
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
