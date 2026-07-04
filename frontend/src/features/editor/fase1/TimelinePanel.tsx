import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  GripVertical,
  Lock,
  MoreVertical,
  MousePointer2,
  Pin,
  Play,
  Plus,
  RotateCw,
  Scissors,
  SplitSquareHorizontal,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Desvio } from '@/types/models';
import type { PlayerHandle } from '@/hooks/useVideoPlayer';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { fetchWaveformPeaks } from '@/lib/api';
import { cn } from '@/lib/utils';
import { hmsParaSeg, segParaHms } from '../timeUtils';

// ─────────────────────────────────────────────────────────────
// TimelinePanel — header refatorado conforme
// `design_reference/src/v2_bruto.jsx:206-402` (BrutoTimelineV2).
// Toolbar enxuta + menu "⋮" (moreV) para zoom/lock/pointer/pin/smartplay.
// O corpo (Waveform interno + WaveSurfer) permanece o existente — apenas
// a toolbar foi redesenhada. Atalhos (`shortcuts.ts`) preservados.
// ─────────────────────────────────────────────────────────────

interface Props {
  audioSrc: string;
  waveformPeaksSrc: string;
  audioOffsetSec?: number;
  inicioSeg: number;
  fimSeg: number;
  desvios: Desvio[];
  currentTime: number;
  playbackRate: number;
  playerRef?: RefObject<PlayerHandle>;
  onSeek: (seg: number) => void;
  onSkip: (delta: number) => void;
  onChangeSpeed: (delta: number) => void;
  onSetInicioAqui?: () => void;
  onSetFimAqui?: () => void;
  onAtualizarAudioTimeline?: () => void;
  locked?: boolean;
  onToggleLocked?: () => void;
  pointer?: boolean;
  onTogglePointer?: () => void;
  smartPlay?: boolean;
  onToggleSmartPlay?: () => void;
  pinned?: boolean;
  onTogglePinned?: () => void;
  onSelectDesvio?: (time: number) => void;
  onAdicionarTrechoAqui?: () => void;
  onChangeDesvio?: (idx: number, novoInicioHms: string, novoFimHms: string) => void;
  onCriarCorteDaSelecao?: (inicioHms: string, fimHms: string, titulo: string) => void;
  // F-061: divide o corte em dois no ponteiro do player.
  onDividirAqui?: () => void;
  dividindo?: boolean;
  onGerarBruto?: () => void;
  brutoPronto?: boolean;
  brutoStatus?: 'idle' | 'processando' | 'concluido' | 'erro';
}

const WB = {
  bgPanel: 'var(--wb-bg-panel)',
  bgCard: 'var(--wb-bg-card)',
  bgInset: 'var(--wb-bg-inset)',
  border: 'var(--wb-border)',
  borderSoft: 'var(--wb-border-soft)',
  text: 'var(--wb-text)',
  textMute: 'var(--wb-text-mute)',
  textDim: 'var(--wb-text-dim)',
  accent: 'var(--wb-accent)',
};

const TIMECODE_SLOTS = 7;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 20;
const ZOOM_STEP_WHEEL = 1.1;
// WaveSurfer aceita 'auto' para preencher o container — necessario para que
// o waveform ocupe toda a altura disponivel do painel (sem deixar grande
// faixa cinza embaixo). Container precisa ter altura definida via flex.

function queryShadow(container: HTMLElement | null, selector: string): HTMLElement | null {
  const host = container?.firstElementChild as HTMLElement | undefined;
  return (host?.shadowRoot?.querySelector(selector) as HTMLElement | null) ?? null;
}

function buildTimecodes(inicio: number, fim: number): string[] {
  if (!(fim > inicio)) return Array(TIMECODE_SLOTS).fill('00:00:00');
  const step = (fim - inicio) / (TIMECODE_SLOTS - 1);
  return Array.from({ length: TIMECODE_SLOTS }, (_, idx) => segParaHms(inicio + step * idx));
}

type RegionsInstance = ReturnType<typeof RegionsPlugin.create>;

function drawRegions(
  regions: RegionsInstance,
  inicioSeg: number,
  fimSeg: number,
  desvios: Desvio[],
  offset: number,
  locked: boolean,
) {
  regions.clearRegions();
  const canMove = !locked;
  const mainRegion = regions.addRegion({
    id: 'corte-principal',
    start: Math.max(0, inicioSeg - offset),
    end: Math.max(0.1, fimSeg - offset),
    color: 'oklch(0.58 0.13 225 / 0.18)',
    drag: false,
    resize: false,
  });
  const regionEl = (mainRegion as unknown as { element: HTMLElement }).element;
  if (regionEl) {
    regionEl.style.overflow = 'visible';
    regionEl.style.pointerEvents = 'none';
  }
  desvios.forEach((d, idx) => {
    try {
      const start = hmsParaSeg(d.inicio_hms) - offset;
      const end = hmsParaSeg(d.fim_hms) - offset;
      if (end <= start) return;
      const region = regions.addRegion({
        id: `desvio-${idx}`,
        start: Math.max(0, start),
        end: Math.max(0.1, end),
        color: 'oklch(0.63 0.21 25 / 0.35)',
        drag: canMove,
        resize: canMove,
      });
      if (!canMove) {
        const el = (region as unknown as { element: HTMLElement }).element;
        if (el) el.style.pointerEvents = 'none';
      }
    } catch {
      // skip malformed desvio
    }
  });
}

interface WaveformProps {
  audioSrc: string;
  waveformPeaksSrc: string;
  audioOffsetSec: number;
  inicioSeg: number;
  fimSeg: number;
  desvios: Desvio[];
  currentTime: number;
  zoomLevel: number;
  locked: boolean;
  pointer: boolean;
  playerRef?: RefObject<PlayerHandle>;
  scrollToCursorNonce: number;
  onSeek: (seg: number) => void;
  onSelectDesvio?: (time: number) => void;
  onChangeDesvio?: (idx: number, inicio: string, fim: string) => void;
  onZoomChange: (next: number) => void;
  onLoadingChange?: (loading: boolean) => void;
}

function Waveform({
  audioSrc,
  waveformPeaksSrc,
  audioOffsetSec,
  inicioSeg,
  fimSeg,
  desvios,
  currentTime,
  zoomLevel,
  locked,
  pointer,
  playerRef,
  scrollToCursorNonce,
  onSeek,
  onSelectDesvio,
  onChangeDesvio,
  onZoomChange,
  onLoadingChange,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsInstance | null>(null);
  const wsReadyRef = useRef(false);
  const lastVideoTimeRef = useRef<number | null>(null);
  const ctrlClickRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);

  const latestRef = useRef({
    audioOffsetSec,
    inicioSeg,
    fimSeg,
    desvios,
    locked,
    currentTime,
    onSeek,
    onSelectDesvio,
    onChangeDesvio,
    onZoomChange,
    onLoadingChange,
    zoomLevel,
    pointer,
    playerRef,
  });
  latestRef.current = {
    audioOffsetSec,
    inicioSeg,
    fimSeg,
    desvios,
    locked,
    currentTime,
    onSeek,
    onSelectDesvio,
    onChangeDesvio,
    onZoomChange,
    onLoadingChange,
    zoomLevel,
    pointer,
    playerRef,
  };

  useEffect(() => {
    if (!containerRef.current || !audioSrc) return;

    wsRef.current?.destroy();
    wsReadyRef.current = false;
    setIsLoading(true);
    latestRef.current.onLoadingChange?.(true);
    let cancelled = false;

    const root = getComputedStyle(document.documentElement);
    const accentColor = root.getPropertyValue('--wb-accent').trim() || '#facc15';

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'oklch(0.58 0.13 225 / 0.82)',
      progressColor: 'oklch(0.58 0.13 225 / 0.45)',
      cursorColor: accentColor,
      cursorWidth: 2,
      barWidth: 2,
      height: 'auto',
      autoCenter: false,
      autoScroll: false,
      minPxPerSec: 50 * latestRef.current.zoomLevel,
    });

    ws.registerPlugin(regions);
    ws.setVolume(0);
    wsRef.current = ws;

    const container = containerRef.current;
    const onPointerDown = (e: PointerEvent) => {
      ctrlClickRef.current = e.ctrlKey || e.metaKey;
    };
    container.addEventListener('pointerdown', onPointerDown);

    ws.on('interaction', (time: number) => {
      const realTime = time + latestRef.current.audioOffsetSec;
      if (ctrlClickRef.current) {
        ctrlClickRef.current = false;
        latestRef.current.onSelectDesvio?.(realTime);
        return;
      }
      latestRef.current.onSeek(realTime);
    });

    ws.on('ready', () => {
      wsReadyRef.current = true;
      setIsLoading(false);
      latestRef.current.onLoadingChange?.(false);
      const {
        audioOffsetSec: offset,
        inicioSeg: inicio,
        fimSeg: fim,
        desvios: dvs,
        locked: lck,
      } = latestRef.current;
      drawRegions(regions, inicio, fim, dvs, offset, lck);
      requestAnimationFrame(() => {
        const cursor = queryShadow(containerRef.current, '.cursor');
        cursorRef.current = cursor;
        if (!cursor || cursor.querySelector('[data-playhead-dot]')) return;
        cursor.style.overflow = 'visible';
        const dot = document.createElement('div');
        dot.dataset.playheadDot = '1';
        dot.style.cssText = [
          'position:absolute',
          'left:50%',
          'top:50%',
          'width:8px',
          'height:8px',
          'border-radius:50%',
          `background:${accentColor}`,
          'transform:translate(-50%,-50%)',
          'pointer-events:none',
          `box-shadow:0 0 0 2px ${accentColor}33`,
        ].join(';');
        cursor.appendChild(dot);
      });
    });

    ws.on('error', () => {
      setIsLoading(false);
      latestRef.current.onLoadingChange?.(false);
    });

    regions.on('region-updated', (region: { id: string; start: number; end: number }) => {
      if (!region.id.startsWith('desvio-')) return;
      const { audioOffsetSec: offset, onChangeDesvio: onChange } = latestRef.current;
      if (!onChange) return;
      const idx = parseInt(region.id.split('-')[1], 10);
      onChange(idx, segParaHms(region.start + offset, true), segParaHms(region.end + offset, true));
    });

    async function loadAudioWithBackendPeaks() {
      try {
        const payload = await fetchWaveformPeaks(waveformPeaksSrc);
        if (cancelled) return;
        await ws.load(audioSrc, [payload.peaks], payload.duration_sec);
      } catch {
        if (!cancelled) await ws.load(audioSrc);
      }
    }

    void loadAudioWithBackendPeaks();

    return () => {
      cancelled = true;
      container.removeEventListener('pointerdown', onPointerDown);
      wsReadyRef.current = false;
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [audioSrc, waveformPeaksSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const ws = wsRef.current;
      if (!ws || !wsReadyRef.current) return;
      let cursor = cursorRef.current;
      if (!cursor || !cursor.isConnected) {
        cursor = queryShadow(containerRef.current, '.cursor');
        cursorRef.current = cursor;
        if (cursor && !cursor.querySelector('[data-playhead-dot]')) {
          cursor.style.overflow = 'visible';
          const accent =
            getComputedStyle(document.documentElement).getPropertyValue('--wb-accent').trim() ||
            '#facc15';
          const dot = document.createElement('div');
          dot.dataset.playheadDot = '1';
          dot.style.cssText = [
            'position:absolute',
            'left:50%',
            'top:50%',
            'width:8px',
            'height:8px',
            'border-radius:50%',
            `background:${accent}`,
            'transform:translate(-50%,-50%)',
            'pointer-events:none',
            `box-shadow:0 0 0 2px ${accent}33`,
          ].join(';');
          cursor.appendChild(dot);
        }
      }
      if (!cursor) return;
      const duration = ws.getDuration();
      if (duration <= 0) return;
      const player = latestRef.current.playerRef?.current;
      const videoTime = player ? player.getCurrentTime() : latestRef.current.currentTime;
      const wsTime = videoTime - latestRef.current.audioOffsetSec;
      const progress = Math.max(0, Math.min(1, wsTime / duration));
      cursor.style.left = `${progress * 100}%`;

      const prev = lastVideoTimeRef.current;
      lastVideoTimeRef.current = videoTime;
      const jumped = prev !== null && Math.abs(videoTime - prev) > 0.75;
      const playing = player?.isPlaying() ?? false;
      if (!jumped && !playing) return;

      const scroller = queryShadow(containerRef.current, '.scroll');
      if (!scroller) return;
      const cursorPx = progress * scroller.scrollWidth;

      if (jumped) {
        scroller.scrollLeft = Math.max(0, cursorPx - scroller.clientWidth / 2);
        return;
      }
      const viewLeft = scroller.scrollLeft;
      const viewRight = viewLeft + scroller.clientWidth;
      const margin = 16;
      if (cursorPx < viewLeft + margin || cursorPx > viewRight - margin) {
        scroller.scrollLeft = Math.max(0, cursorPx - scroller.clientWidth / 2);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const centerWaveformOnCursor = useCallback(() => {
    if (!wsReadyRef.current) return;
    const scroller = queryShadow(containerRef.current, '.scroll');
    const ws = wsRef.current;
    if (!scroller || !ws) return;
    const duration = ws.getDuration();
    if (duration <= 0) return;
    const player = latestRef.current.playerRef?.current;
    const videoTime = player ? player.getCurrentTime() : latestRef.current.currentTime;
    const wsTime = videoTime - latestRef.current.audioOffsetSec;
    const progress = Math.max(0, Math.min(1, wsTime / duration));
    const cursorPx = progress * scroller.scrollWidth;
    scroller.scrollLeft = Math.max(0, cursorPx - scroller.clientWidth / 2);
  }, []);

  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    drawRegions(regions, inicioSeg, fimSeg, desvios, audioOffsetSec, locked);
  }, [inicioSeg, fimSeg, desvios, audioOffsetSec, locked]);

  useEffect(() => {
    if (!wsReadyRef.current) return;
    wsRef.current?.zoom(50 * zoomLevel);
    requestAnimationFrame(() => requestAnimationFrame(centerWaveformOnCursor));
  }, [centerWaveformOnCursor, zoomLevel]);

  useEffect(() => {
    centerWaveformOnCursor();
  }, [centerWaveformOnCursor, scrollToCursorNonce]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? ZOOM_STEP_WHEEL : 1 / ZOOM_STEP_WHEEL;
      const current = latestRef.current.zoomLevel;
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current * factor));
      if (next !== current) latestRef.current.onZoomChange(next);
    };
    node.addEventListener('wheel', handler, { passive: false, capture: true });
    return () =>
      node.removeEventListener('wheel', handler, { capture: true } as EventListenerOptions);
  }, []);

  const timecodes = useMemo(() => buildTimecodes(inicioSeg, fimSeg), [inicioSeg, fimSeg]);

  const panStateRef = useRef<{ startX: number; startScroll: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function readScroll(): number {
    const ws = wsRef.current as unknown as { getScroll?: () => number } | null;
    if (ws?.getScroll) return ws.getScroll();
    return queryShadow(containerRef.current, '.scroll')?.scrollLeft ?? 0;
  }

  function writeScroll(px: number) {
    const ws = wsRef.current as unknown as { setScroll?: (px: number) => void } | null;
    if (ws?.setScroll) {
      ws.setScroll(Math.max(0, px));
      return;
    }
    const scroller = queryShadow(containerRef.current, '.scroll');
    if (scroller) scroller.scrollLeft = Math.max(0, px);
  }

  function onPanDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panStateRef.current = { startX: e.clientX, startScroll: readScroll() };
    setDragging(true);
  }

  function onPanMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = panStateRef.current;
    if (!state) return;
    writeScroll(state.startScroll - (e.clientX - state.startX));
  }

  function onPanUp(e: ReactPointerEvent<HTMLDivElement>) {
    panStateRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        background: WB.bgInset,
        borderRadius: 8,
        border: `1px solid ${WB.borderSoft}`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: WB.textDim,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            zIndex: 10,
            background: WB.bgInset,
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          carregando áudio…
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: 0,
            cursor: pointer ? 'crosshair' : dragging ? 'grabbing' : 'grab',
          }}
        />
        {!pointer && (
          <div
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanUp}
            onPointerCancel={onPanUp}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              cursor: dragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              background: 'transparent',
            }}
          />
        )}
      </div>

      <div
        style={{
          height: 16,
          borderTop: `1px solid ${WB.borderSoft}`,
          background: WB.bgPanel,
          display: 'flex',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: WB.textDim,
          padding: '0 8px',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        {timecodes.map((timecode, idx) => (
          <span key={`tc-${idx}`}>{timecode}</span>
        ))}
      </div>
    </div>
  );
}

// ───── Componentes UI da toolbar (replicam Btn/IconBtn do design) ─────

function TransportGroup({
  onSkipStart,
  onSkipMinus,
  onPlay,
  onSkipPlus,
  onSkipEnd,
}: {
  onSkipStart: () => void;
  onSkipMinus: () => void;
  onPlay: () => void;
  onSkipPlus: () => void;
  onSkipEnd: () => void;
}) {
  // v2_bruto.jsx:216-222 — bloco bg-inset, gap 2, padding 2
  const btn =
    'flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-card)] hover:text-[var(--wb-text)] transition-colors';
  return (
    <div className="flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-[var(--wb-bg-inset)] p-0.5">
      <Tooltip label="Inicio do corte" side="bottom">
        <button type="button" onClick={onSkipStart} aria-label="Inicio" className={btn}>
          <ChevronsLeft size={14} />
        </button>
      </Tooltip>
      <Tooltip label="-5s" side="bottom">
        <button type="button" onClick={onSkipMinus} aria-label="-5s" className={btn}>
          <ChevronLeft size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Play/Pause" side="bottom">
        <button
          type="button"
          onClick={onPlay}
          aria-label="Play/Pause"
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-ink)] text-[var(--wb-ink-fg)] hover:opacity-90 transition-opacity"
        >
          <Play size={13} />
        </button>
      </Tooltip>
      <Tooltip label="+5s" side="bottom">
        <button type="button" onClick={onSkipPlus} aria-label="+5s" className={btn}>
          <ChevronRight size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Fim do corte" side="bottom">
        <button type="button" onClick={onSkipEnd} aria-label="Fim" className={btn}>
          <ChevronsRight size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

function SpeedDisplay({ playbackRate }: { playbackRate: number }) {
  // v2_bruto.jsx:236-255 — pill mono warn, NAO botao
  return (
    <Tooltip label="Velocidade atual (use Ctrl + J/K)" side="bottom">
      <span
        className="flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5 font-code text-[11px] font-bold text-[var(--wb-warn)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        ⚡ {playbackRate.toFixed(2)}×
      </span>
    </Tooltip>
  );
}

// AdvancedMenu — auto-contido, renderiza via createPortal pra escapar
// do overflow:hidden dos containers (Panel/react-resizable-panels) e nao
// ficar cortado. Position:fixed calculado pelo bounding rect do botao.
// Fallback de scroll caso a tela seja muito baixa.
function AdvancedMenu({
  onZoomIn,
  onZoomOut,
  onToggleSmartPlay,
  smartPlay,
  onTogglePointer,
  pointer,
  onToggleLocked,
  locked,
  onTogglePinned,
  pinned,
  zoomLabel,
  rateLabel,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleSmartPlay?: () => void;
  smartPlay?: boolean;
  onTogglePointer?: () => void;
  pointer?: boolean;
  onToggleLocked?: () => void;
  locked?: boolean;
  onTogglePinned?: () => void;
  pinned?: boolean;
  zoomLabel: string;
  rateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calcula posicao do menu (fixed) baseado no bounding rect do botao.
  // Reposiciona em resize/scroll.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const compute = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  // Fechar ao clicar fora (button OU menu portado).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // v2_bruto.jsx:257-326
  const item =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--wb-text)] hover:bg-[var(--wb-bg-inset)] transition-colors';
  const kbd = 'font-code text-[10px] text-[var(--wb-text-dim)]';

  function close() {
    setOpen(false);
  }

  return (
    <>
      <Tooltip label="Ferramentas avancadas" side="bottom">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Ferramentas avancadas"
          aria-expanded={open}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border transition-colors',
            open
              ? 'border-transparent bg-[var(--wb-ink)] text-[var(--wb-ink-fg)]'
              : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
          )}
        >
          <MoreVertical size={14} />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 100,
              maxHeight: 'calc(100vh - 100px)',
            }}
            className="flex w-[240px] flex-col gap-0.5 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-[var(--wb-shadow)]"
          >
            <div className="px-2 pb-1 pt-0.5 font-code text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--wb-text-dim)]">
              Avancado
            </div>
            <button
              type="button"
              onClick={() => {
                close();
                onZoomOut();
              }}
              className={item}
            >
              <ZoomOut size={13} className="text-[var(--wb-text-mute)]" />
              <span className="flex-1">Diminuir zoom</span>
              <span className={kbd}>Ctrl + −</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onZoomIn();
              }}
              className={item}
            >
              <ZoomIn size={13} className="text-[var(--wb-text-mute)]" />
              <span className="flex-1">Aumentar zoom</span>
              <span className={kbd}>Ctrl + +</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onToggleSmartPlay?.();
              }}
              className={item}
              aria-pressed={!!smartPlay}
            >
              <Scissors
                size={13}
                className={smartPlay ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text-mute)]'}
              />
              <span className="flex-1">Reproducao sem trechos{smartPlay ? ' · ativo' : ''}</span>
              <span className={kbd}>Ctrl + B</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onTogglePointer?.();
              }}
              className={item}
              aria-pressed={!!pointer}
            >
              <MousePointer2
                size={13}
                className={pointer ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text-mute)]'}
              />
              <span className="flex-1">{pointer ? 'Modo ponteiro · ativo' : 'Modo ponteiro'}</span>
              <span className={kbd}>Ctrl + P</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onToggleLocked?.();
              }}
              className={item}
              aria-pressed={!!locked}
            >
              {locked ? (
                <Lock size={13} className="text-[var(--wb-accent)]" />
              ) : (
                <Unlock size={13} className="text-[var(--wb-text-mute)]" />
              )}
              <span className="flex-1">{locked ? 'Destravar trecho' : 'Trecho destravado'}</span>
              <span className={kbd}>Ctrl + L</span>
            </button>
            {onTogglePinned && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onTogglePinned();
                }}
                className={item}
                aria-pressed={!!pinned}
              >
                <Pin
                  size={13}
                  className={pinned ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text-mute)]'}
                />
                <span className="flex-1">
                  {pinned ? 'Liberar altura' : 'Fixar altura da timeline'}
                </span>
              </button>
            )}
            <div className="my-1 h-px bg-[var(--wb-border-soft)]" />
            <div className="px-2 py-0.5 font-code text-[10px] text-[var(--wb-text-dim)]">
              Zoom {zoomLabel} · Velocidade {rateLabel}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function TimelinePanel({
  audioSrc,
  audioOffsetSec = 0,
  inicioSeg,
  fimSeg,
  desvios,
  currentTime,
  playbackRate,
  playerRef,
  waveformPeaksSrc: _waveformPeaksSrc,
  onSeek,
  onSkip,
  onSetInicioAqui,
  onSetFimAqui,
  onAtualizarAudioTimeline,
  locked: lockedProp,
  onToggleLocked,
  pointer: pointerProp,
  onTogglePointer,
  smartPlay,
  onToggleSmartPlay,
  pinned,
  onTogglePinned,
  onSelectDesvio,
  onAdicionarTrechoAqui,
  onChangeDesvio,
  onCriarCorteDaSelecao,
  onDividirAqui,
  dividindo,
}: Props) {
  const [lockedFallback, setLockedFallback] = useState(true);
  const locked = lockedProp ?? lockedFallback;
  const toggleLocked = onToggleLocked ?? (() => setLockedFallback((v) => !v));
  const [pointerFallback, setPointerFallback] = useState(true);
  const pointer = pointerProp ?? pointerFallback;
  const togglePointer = onTogglePointer ?? (() => setPointerFallback((v) => !v));
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollToCursorNonce, setScrollToCursorNonce] = useState(0);
  const [audioRefreshing, setAudioRefreshing] = useState(false);

  function requestScrollToCursor() {
    setScrollToCursorNonce((n) => n + 1);
  }

  function handleSeek(seg: number) {
    onSeek(seg);
    requestScrollToCursor();
  }

  function handleSkip(delta: number) {
    onSkip(delta);
    requestScrollToCursor();
  }

  function handleAddSegment() {
    if (onAdicionarTrechoAqui) {
      onAdicionarTrechoAqui();
      return;
    }
    if (!onCriarCorteDaSelecao) return;
    const start = Math.max(inicioSeg, currentTime || inicioSeg);
    const end = Math.min(fimSeg, start + 5);
    onCriarCorteDaSelecao(segParaHms(start, true), segParaHms(end, true), 'Trecho manual');
  }

  function handleZoomIn() {
    setZoomLevel((v) => Math.min(v * 1.5, ZOOM_MAX));
  }

  function handleZoomOut() {
    setZoomLevel((v) => Math.max(v / 1.5, ZOOM_MIN));
  }

  function handleRefreshAudio() {
    if (!onAtualizarAudioTimeline || audioRefreshing) return;
    setAudioRefreshing(true);
    onAtualizarAudioTimeline();
  }

  function handlePlayPause() {
    const player = playerRef?.current;
    if (player) player.togglePlay();
  }

  const zoomLabel = `${zoomLevel.toFixed(1)}×`;
  const rateLabel = `${playbackRate.toFixed(2)}×`;

  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]"
      style={{ overflow: 'visible' }}
    >
      {/* Header — v2_bruto.jsx:209-329 (Panel + toolbar) */}
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <GripVertical size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Timeline
        </span>
        <span className="rounded-full bg-[var(--wb-bg-card)] border border-[var(--wb-border-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-text-mute)]">
          {desvios.length} {desvios.length === 1 ? 'trecho' : 'trechos'}
        </span>

        <div className="flex-1" />

        {/* Toolbar — direita do header */}
        <div className="flex items-center gap-1.5">
          <TransportGroup
            onSkipStart={() => handleSeek(inicioSeg)}
            onSkipMinus={() => handleSkip(-5)}
            onPlay={handlePlayPause}
            onSkipPlus={() => handleSkip(5)}
            onSkipEnd={() => handleSeek(fimSeg)}
          />
          <Tooltip label="Marcar inicio aqui ( [ )" side="bottom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSetInicioAqui}
              disabled={!onSetInicioAqui}
            >
              <Flag />
              In
            </Button>
          </Tooltip>
          <Tooltip label="Marcar fim aqui ( ] )" side="bottom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSetFimAqui}
              disabled={!onSetFimAqui}
            >
              <Flag style={{ transform: 'scaleX(-1)' }} />
              Out
            </Button>
          </Tooltip>
          <div className="h-4 w-px bg-[var(--wb-border)]" aria-hidden />
          <Tooltip label="Adicionar trecho no cursor (Ctrl+Alt+T)" side="bottom">
            <Button type="button" variant="default" size="sm" onClick={handleAddSegment}>
              <Plus />
              Trecho aqui
            </Button>
          </Tooltip>
          {onDividirAqui && (
            <Tooltip label="Dividir corte no cursor (D) — mantém trechos e tempos" side="bottom">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDividirAqui}
                disabled={dividindo}
              >
                <SplitSquareHorizontal />
                Dividir
              </Button>
            </Tooltip>
          )}
          <Tooltip
            label={audioRefreshing ? 'Atualizando onda' : 'Atualizar onda de audio'}
            side="bottom"
          >
            <IconButton
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshAudio}
              disabled={!onAtualizarAudioTimeline || audioRefreshing}
              aria-label="Atualizar onda"
            >
              <RotateCw />
            </IconButton>
          </Tooltip>
          <SpeedDisplay playbackRate={playbackRate} />
          <AdvancedMenu
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onToggleSmartPlay={onToggleSmartPlay}
            smartPlay={smartPlay}
            onTogglePointer={togglePointer}
            pointer={pointer}
            onToggleLocked={toggleLocked}
            locked={locked}
            onTogglePinned={onTogglePinned}
            pinned={pinned}
            zoomLabel={zoomLabel}
            rateLabel={rateLabel}
          />
        </div>
      </header>

      {/* Waveform — corpo */}
      <div className="flex flex-1 flex-col p-3" style={{ minHeight: 0 }}>
        <Waveform
          audioSrc={audioSrc}
          waveformPeaksSrc={_waveformPeaksSrc}
          audioOffsetSec={audioOffsetSec}
          inicioSeg={inicioSeg}
          fimSeg={fimSeg}
          currentTime={currentTime}
          desvios={desvios}
          zoomLevel={zoomLevel}
          locked={locked}
          pointer={pointer}
          playerRef={playerRef}
          scrollToCursorNonce={scrollToCursorNonce}
          onSeek={onSeek}
          onSelectDesvio={onSelectDesvio}
          onChangeDesvio={onChangeDesvio}
          onZoomChange={setZoomLevel}
          onLoadingChange={setAudioRefreshing}
        />
      </div>
    </section>
  );
}
