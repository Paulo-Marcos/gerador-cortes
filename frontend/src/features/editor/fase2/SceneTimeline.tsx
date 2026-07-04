import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, Loader2, Plus, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fetchWaveformPeaks, waveformPeaksUrl } from '@/lib/api';
import type {
  CenaRemotion,
  Desvio,
  SegmentoDetectado,
  WaveformPeaksResponse,
} from '@/types/models';
import { hmsParaSeg, segParaMmSs } from '../timeUtils';
import { metaCena } from './sceneTypes';
import { SceneTypeIcon, sceneTypeStyle } from './SceneTypeIcon';
import type { YoutubeLayout, YoutubeLayoutMode, YoutubeLayoutRegion } from './youtubeLayout';

// ─────────────────────────────────────────────────────────────
// SceneTimeline — replica `design_reference/src/v3_pos.jsx >
// SceneTimelineFull` (177-370).
//
// Estrutura:
//   Panel header "Timeline · cenas + layout YouTube" + badges
//   (N cenas / N regioes) + +Comp/+Full + zoom -/+ a direita (quando editavel).
//   Duas trilhas alinhadas (label mono 76px a esquerda):
//     1. Cenas (h-46): blocos coloridos por tipo, clicaveis ->
//        onSelectCena(idx). Cena ativa: borda 2px + tint.
//     2. Layout YT (h-28): blocos das regioes (compartilhada=info,
//        full=violet), clicaveis -> onSeek.
//   Regua de timecodes (paddingLeft 84) + playhead vertical arrastavel.
//
// Quando `readOnly` (Final), zoom e +Comp/+Full somem; blocos
// continuam visiveis mas nao clicaveis (cursor default).
// ─────────────────────────────────────────────────────────────

/** Opcoes auxiliares emitidas em selecoes pela timeline. */
export interface SelectOptions {
  /** Tempo em segundos onde o clique aconteceu (para seek preciso). */
  tempo: number;
  /** Solicita que a aba correspondente (Cenas/Layout) seja aberta. */
  abrirAba: boolean;
}

interface Props {
  cenas: CenaRemotion[];
  currentTime: number;
  duration: number;
  layoutYoutube?: YoutubeLayout;
  /** Indice da cena que esta sob o playhead (derivado, visual). */
  activeIdx?: number;
  /** I-029 v2: cena selecionada manualmente (Ctrl+click). Pode ser null. */
  selectedCenaIdx?: number | null;
  /** I-029 v2: regiao selecionada manualmente (Ctrl+click ou Ctrl+L). */
  selectedRegionIdx?: number | null;
  onSeek: (seg: number) => void;
  /** Ctrl+click numa cena: seleciona + posiciona o player no ponto do click. */
  onSelectCena?: (idx: number | null, opts?: SelectOptions) => void;
  /** Ctrl+click numa regiao: seleciona + posiciona o player no ponto do click. */
  onSelectRegion?: (idx: number | null, opts?: SelectOptions) => void;
  /** Adicionar uma regiao customizada no tempo atual. */
  onAddRegion?: (modo: YoutubeLayoutMode) => void;
  /** Ajustar inicio/fim de uma regiao do layout YT pela timeline. */
  onRegionResize?: (idx: number, region: YoutubeLayoutRegion) => void;
  /** Botoes [ / ] no header: ajustar inicio/fim da regiao selecionada para o tempo atual. */
  onAjustarInicioPinada?: () => void;
  onAjustarFimPinada?: () => void;
  /** Dados do corte original para desenhar waveform informativa na timeline liquida. */
  waveformCorteId?: string;
  waveformSourceStartSec?: number;
  waveformSourceEndSec?: number;
  waveformDesvios?: Desvio[];
  /** F-054: segmentos detectados (sugestoes) sobre a trilha do Layout YT.
   * Renderizados como overlays tracejados quando status='sugerido'.
   * Ctrl+Click chama onSelectSegmentoDetectado com o indice. */
  segmentosDetectados?: SegmentoDetectado[];
  onSelectSegmentoDetectado?: (indice: number, anchorClientX: number) => void;
  /** F-054: re-roda a detecção de cena no bruto existente (idempotente). */
  onReprocessarSegmentosDetectados?: () => void;
  detectandoSegmentos?: boolean;
  /** Read-only (Final): sem zoom, sem +Comp/+Full, blocos nao clicaveis. */
  readOnly?: boolean;
}

const TIMECODE_SLOTS = 7;
const ZOOM_MIN = 1;
const ZOOM_MAX = 16;
const ZOOM_STEP = 1.25;
const TRACK_LABEL_WIDTH = 76;
const TRACK_GAP = 8;
const TRACK_BORDER = 1;
// Inicio do conteudo da track (apos label + gap + borda esquerda da track).
const TRACK_CONTENT_LEFT = TRACK_LABEL_WIDTH + TRACK_GAP + TRACK_BORDER;
// Espaco perdido a direita do conteudo (borda direita da track).
const TRACK_CONTENT_RIGHT = TRACK_BORDER;
// Alturas das trilhas (I-029 v2: mais altas para clique fino em segmentos
// curtos. Antes: Cenas 46px / Layout 28px — dificil setar arestas).
const SCENE_TRACK_HEIGHT = 68;
const LAYOUT_TRACK_HEIGHT = 44;
const MIN_REGION_SECONDS = 0.1;
const WAVEFORM_BAR_COUNT = 220;

/** preventDefault em Space/Enter dentro de blocos da timeline para nao
 *  acionar o onClick do <button> via teclado — isso causava conflito com
 *  o atalho global de play/pause (Space) e "travamento" indesejado de
 *  segmentos quando o usuario apertava Space com um bloco focado. */
function blockKeyboardActivation(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
  }
}

type ResizeEdge = 'inicio' | 'fim';

interface RegionDragState {
  index: number;
  edge: ResizeEdge;
  pointerId: number;
  initialRegion: YoutubeLayoutRegion;
  region: YoutubeLayoutRegion;
}

interface RemovedSegment {
  start: number;
  end: number;
}

function buildTimecodes(duration: number): string[] {
  if (!(duration > 0)) return Array(TIMECODE_SLOTS).fill('00:00');
  const step = duration / (TIMECODE_SLOTS - 1);
  return Array.from({ length: TIMECODE_SLOTS }, (_, idx) => segParaMmSs(idx * step, true));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function secondsFromPointer(
  event: { clientX: number },
  track: HTMLElement,
  duration: number,
): number {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  return ratio * duration;
}

function zoomIn(zoom: number): number {
  return clamp(zoom * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
}

function zoomOut(zoom: number): number {
  return clamp(zoom / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
}

function normalizeRemovedSegments(
  desvios: Desvio[] | undefined,
  sourceStartSec: number | undefined,
  sourceEndSec: number | undefined,
): RemovedSegment[] {
  if (
    !desvios?.length ||
    sourceStartSec == null ||
    sourceEndSec == null ||
    sourceEndSec <= sourceStartSec
  )
    return [];

  return desvios
    .map((desvio) => {
      const start = clamp(hmsParaSeg(desvio.inicio_hms), sourceStartSec, sourceEndSec);
      const end = clamp(hmsParaSeg(desvio.fim_hms), sourceStartSec, sourceEndSec);
      return end > start ? { start, end } : null;
    })
    .filter((segment): segment is RemovedSegment => Boolean(segment))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function clipTimeToSourceTime(
  clipTime: number,
  sourceStartSec: number | undefined,
  sourceEndSec: number | undefined,
  removedSegments: RemovedSegment[],
): number | null {
  if (sourceStartSec == null || sourceEndSec == null || sourceEndSec <= sourceStartSec) return null;

  let sourceTime = sourceStartSec + Math.max(0, clipTime);
  let removedBeforeClip = 0;
  for (const segment of removedSegments) {
    const clipStart = segment.start - sourceStartSec - removedBeforeClip;
    if (clipTime < clipStart) break;
    const removedDuration = segment.end - segment.start;
    sourceTime += removedDuration;
    removedBeforeClip += removedDuration;
  }

  return clamp(sourceTime, sourceStartSec, sourceEndSec);
}

function peakAtSourceTime(payload: WaveformPeaksResponse, sourceTime: number): number {
  const rel = sourceTime - payload.offset_sec;
  if (rel < 0 || rel > payload.duration_sec || payload.peaks.length === 0) return 0;
  const index = clamp(
    Math.floor((rel / payload.duration_sec) * payload.peaks.length),
    0,
    payload.peaks.length - 1,
  );
  return Math.abs(payload.peaks[index] ?? 0);
}

function buildWaveformBars(
  payload: WaveformPeaksResponse | null,
  duration: number,
  sourceStartSec: number | undefined,
  sourceEndSec: number | undefined,
  desvios: Desvio[] | undefined,
): number[] {
  if (!payload || duration <= 0) return [];

  const removedSegments = normalizeRemovedSegments(desvios, sourceStartSec, sourceEndSec);
  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, idx) => {
    const clipTime = ((idx + 0.5) / WAVEFORM_BAR_COUNT) * duration;
    const sourceTime = clipTimeToSourceTime(
      clipTime,
      sourceStartSec,
      sourceEndSec,
      removedSegments,
    );
    if (sourceTime == null) return 0;
    return peakAtSourceTime(payload, sourceTime);
  });
}

function resizeRegionAt(
  region: YoutubeLayoutRegion,
  edge: ResizeEdge,
  seconds: number,
  duration: number,
): YoutubeLayoutRegion {
  const safeDuration = Math.max(MIN_REGION_SECONDS, duration);
  const time = clamp(round1(seconds), 0, safeDuration);
  if (edge === 'inicio') {
    const maxStart = Math.max(
      0,
      Math.min(region.fim - MIN_REGION_SECONDS, safeDuration - MIN_REGION_SECONDS),
    );
    return { ...region, inicio: clamp(time, 0, maxStart) };
  }

  return { ...region, fim: clamp(time, region.inicio + MIN_REGION_SECONDS, safeDuration) };
}

export function SceneTimeline({
  cenas,
  currentTime,
  duration,
  layoutYoutube,
  activeIdx,
  selectedCenaIdx,
  selectedRegionIdx,
  onSeek,
  onSelectCena,
  onSelectRegion,
  onAddRegion,
  onRegionResize,
  onAjustarInicioPinada,
  onAjustarFimPinada,
  waveformCorteId,
  waveformSourceStartSec,
  waveformSourceEndSec,
  waveformDesvios,
  segmentosDetectados,
  onSelectSegmentoDetectado,
  onReprocessarSegmentosDetectados,
  detectandoSegmentos = false,
  readOnly = false,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState<RegionDragState | null>(null);
  const [playheadPointerId, setPlayheadPointerId] = useState<number | null>(null);
  const [waveformPayload, setWaveformPayload] = useState<WaveformPeaksResponse | null>(null);
  const dragStateRef = useRef<RegionDragState | null>(null);
  const sceneTrackRef = useRef<HTMLDivElement | null>(null);
  const layoutTrackRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const innerContentRef = useRef<HTMLDivElement | null>(null);
  const hasSelectedRegion = selectedRegionIdx != null && selectedRegionIdx >= 0;
  const safeDuration = Math.max(1, duration);
  const ordenadas = [...cenas].sort((a, b) => a.inicio - b.inicio);
  const regioes: YoutubeLayoutRegion[] = layoutYoutube?.regioes ?? [];
  const displayedRegioes = dragState
    ? regioes.map((region, idx) => (idx === dragState.index ? dragState.region : region))
    : regioes;
  const timecodes = buildTimecodes(safeDuration);
  const showAddButtons = !readOnly && onAddRegion;
  const canResizeRegions = !readOnly && Boolean(onRegionResize);
  const isDraggingRegion = dragState !== null;
  const isDraggingPlayhead = playheadPointerId !== null;
  const waveformBars = useMemo(
    () =>
      buildWaveformBars(
        waveformPayload,
        safeDuration,
        waveformSourceStartSec,
        waveformSourceEndSec,
        waveformDesvios,
      ),
    [safeDuration, waveformDesvios, waveformPayload, waveformSourceEndSec, waveformSourceStartSec],
  );

  // O playhead vive em "% da duracao". Quando zoom > 1, o container
  // das trilhas e maior que o viewport — playhead acompanha o conteudo.
  const playheadPercent = Math.max(0, Math.min(100, (currentTime / safeDuration) * 100));

  const seekFromPointer = useCallback(
    (event: { clientX: number }) => {
      const track = sceneTrackRef.current ?? layoutTrackRef.current;
      if (!track) return;
      onSeek(secondsFromPointer(event, track, safeDuration));
    },
    [onSeek, safeDuration],
  );

  const startPlayheadDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setPlayheadPointerId(event.pointerId);
    seekFromPointer(event);
  };

  // Clique na area vazia da trilha = seek. Blocos (buttons) sao filhos
  // posicionados em absolute — quando o usuario clica no fundo da trilha,
  // e.target === e.currentTarget; cliques em bloco caem no proprio botao
  // e nao acionam este handler.
  const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * safeDuration);
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    startPlayheadDrag(event);
  };

  // Wheel-zoom centrado no cursor com Ctrl pressionado (igual padrao
  // de editores de video). Sem Ctrl, deixa o scroll natural acontecer
  // (vertical no body / horizontal na timeline quando zoomada). Listener
  // nativo nao-passivo porque React monta onWheel passivo por default.
  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport || readOnly) return;

    const handleNativeWheel = (event: WheelEvent) => {
      // I-029 v2: zoom apenas com Ctrl/Cmd. Sem modifier, deixa scroll passar.
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.deltaY === 0) return;
      event.preventDefault();
      const inner = innerContentRef.current;
      if (!inner) return;

      const oldInnerWidth = inner.offsetWidth;
      const viewportRect = viewport.getBoundingClientRect();
      const cursorX = event.clientX - viewportRect.left;
      const oldScrollLeft = viewport.scrollLeft;
      const direction = event.deltaY < 0 ? 1 : -1;

      setZoom((prev) => {
        const next = direction > 0 ? zoomIn(prev) : zoomOut(prev);
        if (next === prev) return prev;

        // Conservar o tempo sob o cursor: posicao no inner permanece a mesma
        // razao em relacao a area utilizavel da track (excluindo label fixo).
        const innerPosOld = oldScrollLeft + cursorX;
        const trackPosOld = innerPosOld - TRACK_CONTENT_LEFT;
        const trackUsableOld = Math.max(
          1,
          oldInnerWidth - TRACK_CONTENT_LEFT - TRACK_CONTENT_RIGHT,
        );

        // Aguarda re-render para ler a nova largura real do inner.
        requestAnimationFrame(() => {
          const newInnerWidth = inner.offsetWidth;
          const trackUsableNew = Math.max(
            1,
            newInnerWidth - TRACK_CONTENT_LEFT - TRACK_CONTENT_RIGHT,
          );
          let innerPosNew: number;
          if (trackPosOld <= 0) {
            // Cursor sobre o label — nao escala, fica ancorado a esquerda.
            innerPosNew = innerPosOld;
          } else {
            const ratio = trackPosOld / trackUsableOld;
            innerPosNew = TRACK_CONTENT_LEFT + ratio * trackUsableNew;
          }
          const maxScroll = Math.max(0, newInnerWidth - viewport.clientWidth);
          viewport.scrollLeft = clamp(innerPosNew - cursorX, 0, maxScroll);
        });

        return next;
      });
    };

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleNativeWheel);
    };
  }, [readOnly]);

  const handleRegionResizeStart = (
    event: React.PointerEvent<HTMLSpanElement>,
    index: number,
    edge: ResizeEdge,
    region: YoutubeLayoutRegion,
  ) => {
    if (!canResizeRegions) return;
    const track = layoutTrackRef.current;
    if (!track) return;
    event.preventDefault();
    event.stopPropagation();
    const nextRegion = resizeRegionAt(
      region,
      edge,
      secondsFromPointer(event, track, safeDuration),
      safeDuration,
    );
    const nextState: RegionDragState = {
      index,
      edge,
      pointerId: event.pointerId,
      initialRegion: region,
      region: nextRegion,
    };
    dragStateRef.current = nextState;
    setDragState(nextState);
    // I-029 v2: NAO chama onSeek — arrastar a aresta de uma regiao nao deve
    // mover o playhead (paridade com a timeline da Bruta). O usuario ajusta
    // o segmento sem perder a referencia visual de onde o video esta.
  };

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!waveformCorteId) {
      setWaveformPayload(null);
      return;
    }

    let cancelled = false;
    const baseUrl = waveformPeaksUrl(waveformCorteId);
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}points=2400`;

    async function loadWaveform() {
      try {
        const payload = await fetchWaveformPeaks(url);
        if (!cancelled) setWaveformPayload(payload);
      } catch {
        if (!cancelled) setWaveformPayload(null);
      }
    }

    void loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [waveformCorteId]);

  useEffect(() => {
    if (playheadPointerId == null) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== playheadPointerId) return;
      event.preventDefault();
      seekFromPointer(event);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== playheadPointerId) return;
      event.preventDefault();
      setPlayheadPointerId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [playheadPointerId, seekFromPointer]);

  useEffect(() => {
    if (!isDraggingRegion) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current;
      const track = layoutTrackRef.current;
      if (!current || !track || event.pointerId !== current.pointerId) return;

      event.preventDefault();
      const nextRegion = resizeRegionAt(
        current.initialRegion,
        current.edge,
        secondsFromPointer(event, track, safeDuration),
        safeDuration,
      );
      const nextState = { ...current, region: nextRegion };
      dragStateRef.current = nextState;
      setDragState(nextState);
      // I-029 v2: NAO move o playhead durante o resize — paridade com a Bruta.
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || event.pointerId !== current.pointerId) return;

      event.preventDefault();
      dragStateRef.current = null;
      setDragState(null);
      onRegionResize?.(current.index, current.region);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [isDraggingRegion, onRegionResize, safeDuration]);

  return (
    <section className="flex flex-shrink-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      {/* Panel header — v3_pos.jsx:180-196 */}
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <GripVertical size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Timeline · cenas + layout YouTube
        </span>
        <span className="rounded-full bg-[var(--wb-bg-card)] border border-[var(--wb-border-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-text-mute)]">
          {ordenadas.length} cenas
        </span>
        <span className="rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
          {regioes.length} {regioes.length === 1 ? 'região' : 'regiões'}
        </span>
        <div className="flex-1" />
        {!readOnly && (
          <>
            {showAddButtons && (
              <div className="mr-1 flex items-center gap-1">
                <Tooltip label="Adicionar regiao Compartilhada no tempo atual" side="bottom">
                  <button
                    type="button"
                    onClick={() => onAddRegion('compartilhada')}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-info)]/45 bg-[var(--wb-info-soft)] px-2 font-code text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--wb-info)] transition-opacity hover:opacity-85"
                  >
                    <Plus size={11} strokeWidth={2.4} />
                    Comp.
                  </button>
                </Tooltip>
                <Tooltip label="Adicionar regiao Full no tempo atual" side="bottom">
                  <button
                    type="button"
                    onClick={() => onAddRegion('full')}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-violet)]/45 bg-[var(--wb-violet-soft)] px-2 font-code text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--wb-violet)] transition-opacity hover:opacity-85"
                  >
                    <Plus size={11} strokeWidth={2.4} />
                    Full
                  </button>
                </Tooltip>
              </div>
            )}
            {hasSelectedRegion && (
              <div className="mr-1 flex items-center gap-1">
                <Tooltip
                  label="[: ajusta o INICIO da regiao travada para o tempo atual"
                  side="bottom"
                >
                  <button
                    type="button"
                    onClick={() => onAjustarInicioPinada?.()}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-accent)]/45 bg-[var(--wb-accent-soft)] px-2 font-code text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--wb-accent)] transition-opacity hover:opacity-85"
                    aria-label="Ajustar inicio da regiao travada"
                  >
                    [
                  </button>
                </Tooltip>
                <Tooltip label="]: ajusta o FIM da regiao travada para o tempo atual" side="bottom">
                  <button
                    type="button"
                    onClick={() => onAjustarFimPinada?.()}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-accent)]/45 bg-[var(--wb-accent-soft)] px-2 font-code text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--wb-accent)] transition-opacity hover:opacity-85"
                    aria-label="Ajustar fim da regiao travada"
                  >
                    ]
                  </button>
                </Tooltip>
              </div>
            )}
            <Tooltip label="Diminuir zoom" side="bottom">
              <button
                type="button"
                onClick={() => setZoom((z) => zoomOut(z))}
                disabled={zoom <= ZOOM_MIN}
                aria-label="Diminuir zoom"
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:opacity-40"
              >
                <ZoomOut size={13} />
              </button>
            </Tooltip>
            <Tooltip label="Aumentar zoom (ou role o mouse sobre a timeline)" side="bottom">
              <button
                type="button"
                onClick={() => setZoom((z) => zoomIn(z))}
                disabled={zoom >= ZOOM_MAX}
                aria-label="Aumentar zoom"
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] disabled:opacity-40"
              >
                <ZoomIn size={13} />
              </button>
            </Tooltip>
          </>
        )}
      </header>

      {/* Corpo: scroll horizontal quando zoom > 1. Altura natural — o
          parent decide quanto espaco a timeline ocupa (Player fica com
          o resto via flex-1). Wheel-zoom usa listener nativo (useEffect)
          porque React monta onWheel como passivo. */}
      <div
        ref={timelineViewportRef}
        className="relative flex flex-col gap-1.5 overflow-x-auto px-3 py-2.5"
      >
        <div ref={innerContentRef} style={{ minWidth: `${zoom * 100}%`, position: 'relative' }}>
          {/* Playhead vertical atravessando as 2 trilhas (mas nao a regua).
              Posicao calculada NO MESMO sistema de coordenadas dos blocos:
              TRACK_CONTENT_LEFT (label + gap + borda esq.) + (100% - bordas
              - labelOffset) * fracao. Antes, o playhead ignorava as bordas
              de 1px da track e divergia ~3px dos blocos — em zoom 1 sobre
              um corte de 14min isso virava ~7 segundos de defasagem. */}
          <div
            aria-hidden
            className={cn(
              'absolute z-[30] w-3 -translate-x-1/2 cursor-ew-resize',
              isDraggingPlayhead && 'drop-shadow-[0_0_6px_var(--wb-accent)]',
            )}
            onPointerDown={startPlayheadDrag}
            style={{
              left: `calc(${TRACK_CONTENT_LEFT}px + (100% - ${TRACK_CONTENT_LEFT + TRACK_CONTENT_RIGHT}px) * ${playheadPercent / 100})`,
              top: 0,
              bottom: 22, // regua tem ~22px de altura
            }}
          >
            <div className="mx-auto h-full w-[2px] bg-[var(--wb-accent)]" />
            <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--wb-bg-card)] bg-[var(--wb-accent)] shadow-sm" />
          </div>

          {/* Trilha Cenas (I-029 v2: mais alta) */}
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="flex-shrink-0 font-code text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]"
              style={{ width: TRACK_LABEL_WIDTH }}
            >
              Cenas
            </span>
            <div
              ref={sceneTrackRef}
              className={cn(
                'relative flex-1 overflow-hidden rounded-[6px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)]',
                readOnly ? 'cursor-default' : 'cursor-pointer',
              )}
              style={{ height: SCENE_TRACK_HEIGHT }}
              onPointerDown={handleTrackPointerDown}
              onClick={handleTrackClick}
            >
              <WaveformBackdrop bars={waveformBars} />
              {ordenadas.map((cena, idx) => {
                const left = Math.max(0, Math.min(100, (cena.inicio / safeDuration) * 100));
                const width = Math.max(1, ((cena.fim - cena.inicio) / safeDuration) * 100);
                const style = sceneTypeStyle(cena.tipo);
                const meta = metaCena(cena.tipo);
                const isActive = activeIdx === idx;
                const isSelected = selectedCenaIdx === idx;
                return (
                  <button
                    key={`${cena.tipo}-${idx}-${cena.inicio}`}
                    type="button"
                    title={`${meta.label} · ${cena.texto || ''} · ${segParaMmSs(cena.inicio, true)}`}
                    onKeyDown={blockKeyboardActivation}
                    onClick={(event) => {
                      if (readOnly) return;
                      event.stopPropagation();
                      const track = sceneTrackRef.current;
                      const tempo = track
                        ? secondsFromPointer(event, track, safeDuration)
                        : cena.inicio;
                      if (event.ctrlKey || event.metaKey) {
                        // Ctrl+click = seleciona + abre aba Cenas; player vai
                        // ao ponto exato do clique (nao ao inicio da cena).
                        onSelectCena?.(idx, { tempo, abrirAba: true });
                      }
                      onSeek(tempo);
                    }}
                    disabled={readOnly}
                    aria-label={`Cena ${meta.label}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'absolute z-10 flex items-center gap-1.5 overflow-hidden rounded-[5px] border px-2 transition-colors',
                      readOnly ? 'cursor-default' : 'cursor-pointer',
                    )}
                    style={{
                      // Sem offset extra: bloco usa exatamente a fracao do tempo,
                      // garantindo alinhamento pixel-perfect com o playhead.
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 4,
                      bottom: 4,
                      background: isSelected
                        ? 'color-mix(in oklch, var(--wb-accent) 30%, var(--wb-bg-card))'
                        : isActive
                          ? `color-mix(in oklch, ${style.color} 30%, var(--wb-bg-card))`
                          : style.soft,
                      borderColor: isSelected
                        ? 'var(--wb-accent)'
                        : isActive
                          ? style.color
                          : style.border,
                      borderWidth: isSelected || isActive ? 2 : 1,
                      color: style.color,
                      boxShadow: isSelected
                        ? '0 0 0 2px color-mix(in oklch, var(--wb-accent) 45%, transparent)'
                        : isActive
                          ? 'var(--wb-shadow)'
                          : undefined,
                    }}
                  >
                    <SceneTypeIcon tipo={cena.tipo} size={11} />
                    <span className="truncate text-[10.5px] font-semibold text-[var(--wb-text)]">
                      {cena.texto || meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trilha Layout YT (I-029 v2: mais alta, sem rotulo "compartilhada/full"). */}
          <div className="flex items-center gap-2">
            <div
              className="flex flex-shrink-0 items-center gap-1"
              style={{ width: TRACK_LABEL_WIDTH }}
            >
              <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Layout YT
              </span>
              {/* F-054: re-roda detecção no bruto existente. Só aparece quando
                  o consumidor passa o callback (fora do read-only, ex.: Final). */}
              {!readOnly && onReprocessarSegmentosDetectados && (
                <Tooltip
                  label={
                    detectandoSegmentos
                      ? 'Detectando segmentos…'
                      : 'Reprocessar segmentos detectados no bruto'
                  }
                  side="top"
                >
                  <button
                    type="button"
                    onClick={onReprocessarSegmentosDetectados}
                    disabled={detectandoSegmentos}
                    aria-label="Reprocessar segmentos detectados"
                    className="flex h-4 w-4 items-center justify-center rounded text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:cursor-wait disabled:opacity-50"
                  >
                    {detectandoSegmentos ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <RotateCw size={10} />
                    )}
                  </button>
                </Tooltip>
              )}
            </div>
            <div
              ref={layoutTrackRef}
              className={cn(
                'relative flex-1 overflow-hidden rounded-[6px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)]',
                readOnly ? 'cursor-default' : 'cursor-pointer',
              )}
              style={{ height: LAYOUT_TRACK_HEIGHT }}
              onPointerDown={handleTrackPointerDown}
              onClick={handleTrackClick}
            >
              <WaveformBackdrop bars={waveformBars} compact />
              {/* F-054: marcadores de segmentos detectados (sugeridos). Ficam
                  abaixo das regioes (z-5) com tracejado para nao confundir com
                  regioes oficiais. So renderiza os com status 'sugerido' —
                  decididos (aceitos viraram regiao real, rejeitados somem). */}
              {!readOnly &&
                segmentosDetectados?.map((seg, idx) => {
                  if (seg.status !== 'sugerido') return null;
                  const left = Math.max(0, Math.min(100, (seg.inicio / safeDuration) * 100));
                  const width = Math.max(0.5, ((seg.fim - seg.inicio) / safeDuration) * 100);
                  return (
                    <button
                      key={`detectado-${idx}-${seg.inicio}`}
                      type="button"
                      title={`Sugestão · ${segParaMmSs(seg.inicio, true)} → ${segParaMmSs(seg.fim, true)} (Ctrl+Click para decidir)`}
                      onKeyDown={blockKeyboardActivation}
                      onClick={(event) => {
                        if (readOnly) return;
                        event.stopPropagation();
                        if (event.ctrlKey || event.metaKey) {
                          onSelectSegmentoDetectado?.(idx, event.clientX);
                          return;
                        }
                        // Click sem modifier = comportamento padrao da timeline
                        // (seek na posicao do click).
                        const track = layoutTrackRef.current;
                        const tempo = track
                          ? secondsFromPointer(event, track, safeDuration)
                          : seg.inicio;
                        onSeek(tempo);
                      }}
                      aria-label="Segmento detectado (sugestão)"
                      className="absolute z-[5] cursor-pointer rounded-[3px] border border-dashed transition-opacity hover:opacity-100"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        top: 1,
                        bottom: 1,
                        background: 'color-mix(in oklch, var(--wb-warn) 10%, transparent)',
                        borderColor: 'color-mix(in oklch, var(--wb-warn) 70%, transparent)',
                        opacity: 0.75,
                      }}
                    />
                  );
                })}
              {displayedRegioes.map((region, idx) => {
                const isFull = region.modo === 'full';
                const left = Math.max(0, Math.min(100, (region.inicio / safeDuration) * 100));
                const width = Math.max(0.5, ((region.fim - region.inicio) / safeDuration) * 100);
                const tone = isFull ? 'var(--wb-violet)' : 'var(--wb-info)';
                const resizing = dragState?.index === idx;
                const isSelected = selectedRegionIdx === idx;
                return (
                  <button
                    key={`${region.modo}-${idx}-${region.inicio}`}
                    type="button"
                    title={`${region.modo} · ${segParaMmSs(region.inicio, true)} → ${segParaMmSs(region.fim, true)}`}
                    onKeyDown={blockKeyboardActivation}
                    onClick={(event) => {
                      if (readOnly) return;
                      event.stopPropagation();
                      const track = layoutTrackRef.current;
                      const tempo = track
                        ? secondsFromPointer(event, track, safeDuration)
                        : region.inicio;
                      if (event.ctrlKey || event.metaKey) {
                        // Ctrl+click = seleciona regiao + abre aba Layout;
                        // playhead vai ao ponto exato do clique.
                        onSelectRegion?.(idx, { tempo, abrirAba: true });
                      }
                      onSeek(tempo);
                    }}
                    disabled={readOnly}
                    aria-label={`Região ${region.modo}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'group absolute z-10 flex items-center gap-1.5 rounded-[4px] border px-2 transition-colors',
                      readOnly ? 'cursor-default' : 'cursor-pointer',
                    )}
                    style={{
                      // Sem offset: alinhamento pixel-perfect com o playhead.
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 3,
                      bottom: 3,
                      background: isSelected
                        ? 'color-mix(in oklch, var(--wb-accent) 28%, var(--wb-bg-card))'
                        : `color-mix(in oklch, ${tone} 22%, var(--wb-bg-card))`,
                      borderColor: isSelected
                        ? 'var(--wb-accent)'
                        : `color-mix(in oklch, ${tone} 60%, var(--wb-border))`,
                      borderWidth: isSelected ? 2 : 1,
                      color: tone,
                      boxShadow: resizing
                        ? `0 0 0 2px color-mix(in oklch, ${tone} 55%, transparent)`
                        : isSelected
                          ? '0 0 0 2px color-mix(in oklch, var(--wb-accent) 50%, transparent)'
                          : undefined,
                    }}
                  >
                    {canResizeRegions && (
                      <>
                        <span
                          aria-hidden
                          className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-ew-resize rounded-l-[4px] border-l border-white/55 bg-white/10 opacity-70 transition-opacity hover:bg-white/25 group-hover:opacity-100"
                          onPointerDown={(event) =>
                            handleRegionResizeStart(event, idx, 'inicio', region)
                          }
                          onClick={(event) => event.stopPropagation()}
                        />
                        <span
                          aria-hidden
                          className="absolute bottom-0 right-0 top-0 z-10 w-2 cursor-ew-resize rounded-r-[4px] border-r border-white/55 bg-white/10 opacity-70 transition-opacity hover:bg-white/25 group-hover:opacity-100"
                          onPointerDown={(event) =>
                            handleRegionResizeStart(event, idx, 'fim', region)
                          }
                          onClick={(event) => event.stopPropagation()}
                        />
                      </>
                    )}
                    {/* Identidade do bloco = cor (sem rotulo textual). Dot
                        colorido reforca para usuarios daltonicos a borda. */}
                    <span
                      className="h-2 w-2 rounded-[2px]"
                      style={{ background: tone }}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Régua de timecodes — mesmo sistema de coordenadas das tracks
              (label + borda esq.) para casar os marcos visuais com os blocos. */}
          <div
            className="mt-1.5 flex justify-between font-code text-[9.5px] text-[var(--wb-text-dim)]"
            style={{
              paddingLeft: TRACK_CONTENT_LEFT,
              paddingRight: TRACK_CONTENT_RIGHT,
            }}
          >
            {timecodes.map((tc, idx) => (
              <span key={`tc-${idx}`}>{tc}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WaveformBackdrop({ bars, compact = false }: { bars: number[]; compact?: boolean }) {
  if (bars.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-[2px] z-0 flex items-center gap-px overflow-hidden opacity-55"
    >
      {bars.map((value, idx) => {
        const height = Math.max(compact ? 18 : 14, Math.min(100, value * (compact ? 88 : 96)));
        return (
          <span
            key={`wave-${idx}`}
            className="min-w-[1px] flex-1 rounded-full"
            style={{
              height: `${height}%`,
              background: 'color-mix(in oklch, var(--wb-info) 24%, transparent)',
            }}
          />
        );
      })}
    </div>
  );
}
