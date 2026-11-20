import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fetchWaveformPeaks, waveformPeaksUrl } from '@/lib/api';
import type { CenaRemotion, Desvio, SegmentoDetectado, WaveformPeaksResponse } from '@/types/models';
import { segParaMmSs } from '../timeUtils';
import { tirarCenasRiscadas } from './planoDasCenas';
import { LegendaDaOrigem } from './CenaComOrigem';
import type { YoutubeLayout, YoutubeLayoutMode, YoutubeLayoutRegion } from '@/shared/palco/youtubeLayout';
import { limitar } from '@/lib/limitar';
import { Icon } from '@/upgrade/Icon';
import { FERRAMENTA_ICONE, FERRAMENTA_TEXTO } from '../salaDoEditor';
import { AgulhaDaPos } from './agulhaDaPos';
import { barrasDaOnda } from './ondaDaLinhaDoTempo';
import { PistaDeAudio, PistaDeCenas, PistaDeLayout, type GestosDaPista } from './PistasDaLinhaDoTempo';

// ─────────────────────────────────────────────────────────────
// SceneTimeline — a linha do tempo da Pós (DIRECAO §7.4, D-1164).
//
// Três pistas na MESMA régua (76 px de rótulo à esquerda):
//   Cenas   blocos por origem no plano; a que está sob a agulha leva o traço do feixe.
//   Layout  regiões do palco (compartilhada em `info`, cheia em `iris`) e as sugestões.
//   Áudio   a onda do corte líquido (os trechos que saem somem dela).
// A régua de tempo fica embaixo e a agulha (traço + rótulo) atravessa as três pistas.
//
// Sem blur de fundo: a Pós toca vídeo (§3.6). Com `readOnly` (Final) o zoom e o
// "+ Comp./+ Full" somem; com `seekable` navega-se mesmo assim.
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
  /** F-054: segmentos detectados (sugestoes) sobre a pista do Layout.
   * Renderizados como blocos tracejados quando status='sugerido'.
   * Ctrl+Click chama onSelectSegmentoDetectado com o indice. */
  segmentosDetectados?: SegmentoDetectado[];
  onSelectSegmentoDetectado?: (indice: number, anchorClientX: number) => void;
  /** F-054: re-roda a detecção de cena no bruto existente (idempotente). */
  onReprocessarSegmentosDetectados?: () => void;
  detectandoSegmentos?: boolean;
  /** Read-only (Final): sem zoom, sem +Comp/+Full, sem resize/edicao. */
  readOnly?: boolean;
  /** D-381: permite NAVEGAR (seek) mesmo em `readOnly`; a edicao continua desligada. */
  seekable?: boolean;
  /** D-396: as cenas já estão no vídeo final: a contagem ganha o visto. */
  cenasRenderizadas?: boolean;
  /** D-396: o palco já foi gerado: "N regiões" vira "palco gerado". */
  palcoGerado?: boolean;
}

const TIMECODE_SLOTS = 7;
const ZOOM_MIN = 1;
const ZOOM_MAX = 16;
const ZOOM_STEP = 1.25;
// Onde o conteúdo das pistas começa: rótulo (76) + vão (8) + borda (1). A agulha usa o mesmo número.
const CONTEUDO_ESQ = 85;
const CONTEUDO_DIR = 1;
const MIN_REGION_SECONDS = 0.1;

type ResizeEdge = 'inicio' | 'fim';

interface RegionDragState {
  index: number;
  edge: ResizeEdge;
  pointerId: number;
  initialRegion: YoutubeLayoutRegion;
  region: YoutubeLayoutRegion;
}

function buildTimecodes(duration: number): string[] {
  if (!(duration > 0)) return Array(TIMECODE_SLOTS).fill('00:00');
  const step = duration / (TIMECODE_SLOTS - 1);
  return Array.from({ length: TIMECODE_SLOTS }, (_, idx) => segParaMmSs(idx * step, true));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function secondsFromPointer(event: { clientX: number }, track: HTMLElement, duration: number): number {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return limitar((event.clientX - rect.left) / rect.width, 0, 1) * duration;
}

function zoomIn(zoom: number): number {
  return limitar(zoom * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
}

function zoomOut(zoom: number): number {
  return limitar(zoom / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
}

function resizeRegionAt(
  region: YoutubeLayoutRegion,
  edge: ResizeEdge,
  seconds: number,
  duration: number,
): YoutubeLayoutRegion {
  const safeDuration = Math.max(MIN_REGION_SECONDS, duration);
  const time = limitar(round1(seconds), 0, safeDuration);
  if (edge === 'inicio') {
    const maxStart = Math.max(0, Math.min(region.fim - MIN_REGION_SECONDS, safeDuration - MIN_REGION_SECONDS));
    return { ...region, inicio: limitar(time, 0, maxStart) };
  }
  return { ...region, fim: limitar(time, region.inicio + MIN_REGION_SECONDS, safeDuration) };
}

/** O zoom com Ctrl+roda, centrado no cursor. Sem Ctrl a roda rola a linha do tempo. */
function useZoomPelaRoda(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  innerRef: React.RefObject<HTMLDivElement | null>,
  setZoom: React.Dispatch<React.SetStateAction<number>>,
  readOnly: boolean,
) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || readOnly) return;

    const aoRolar = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      const inner = innerRef.current;
      if (!inner) return;

      const larguraAntes = inner.offsetWidth;
      const cursorX = event.clientX - viewport.getBoundingClientRect().left;
      const rolagemAntes = viewport.scrollLeft;
      const aproximar = event.deltaY < 0;

      setZoom((anterior) => {
        const proximo = aproximar ? zoomIn(anterior) : zoomOut(anterior);
        if (proximo === anterior) return anterior;

        // Conserva o tempo sob o cursor: a razão dentro da área útil da pista não muda.
        const posAntes = rolagemAntes + cursorX;
        const naPistaAntes = posAntes - CONTEUDO_ESQ;
        const uteisAntes = Math.max(1, larguraAntes - CONTEUDO_ESQ - CONTEUDO_DIR);

        requestAnimationFrame(() => {
          const larguraDepois = inner.offsetWidth;
          const uteisDepois = Math.max(1, larguraDepois - CONTEUDO_ESQ - CONTEUDO_DIR);
          // Cursor sobre o rótulo: não escala, fica ancorado à esquerda.
          const posDepois = naPistaAntes <= 0 ? posAntes : CONTEUDO_ESQ + (naPistaAntes / uteisAntes) * uteisDepois;
          const rolagemMaxima = Math.max(0, larguraDepois - viewport.clientWidth);
          viewport.scrollLeft = limitar(posDepois - cursorX, 0, rolagemMaxima);
        });

        return proximo;
      });
    };

    viewport.addEventListener('wheel', aoRolar, { passive: false });
    return () => viewport.removeEventListener('wheel', aoRolar);
  }, [viewportRef, innerRef, setZoom, readOnly]);
}

/** Arrastar (cursor e seleção de texto do corpo travados) com os eventos do ponteiro na janela. */
function useArrastoNaJanela(
  ativo: boolean,
  aoMover: (event: globalThis.PointerEvent) => void,
  aoSoltar: (event: globalThis.PointerEvent) => void,
) {
  useEffect(() => {
    if (!ativo) return;
    const cursorAntes = document.body.style.cursor;
    const selecaoAntes = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
    return () => {
      document.body.style.cursor = cursorAntes;
      document.body.style.userSelect = selecaoAntes;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    };
  }, [ativo, aoMover, aoSoltar]);
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
  seekable = false,
  cenasRenderizadas = false,
  palcoGerado = false,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState<RegionDragState | null>(null);
  const [playheadPointerId, setPlayheadPointerId] = useState<number | null>(null);
  const [waveformPayload, setWaveformPayload] = useState<WaveformPeaksResponse | null>(null);
  const dragStateRef = useRef<RegionDragState | null>(null);
  const sceneTrackRef = useRef<HTMLDivElement | null>(null);
  const layoutTrackRef = useRef<HTMLDivElement | null>(null);
  const audioTrackRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const innerContentRef = useRef<HTMLDivElement | null>(null);
  const hasSelectedRegion = selectedRegionIdx != null && selectedRegionIdx >= 0;
  const safeDuration = Math.max(1, duration);
  const ordenadas = (readOnly ? tirarCenasRiscadas(cenas) : [...cenas]).sort((a, b) => a.inicio - b.inicio);
  const regioes: YoutubeLayoutRegion[] = layoutYoutube?.regioes ?? [];
  const displayedRegioes = dragState
    ? regioes.map((region, idx) => (idx === dragState.index ? dragState.region : region))
    : regioes;
  const timecodes = buildTimecodes(safeDuration);
  const showAddButtons = !readOnly && onAddRegion;
  const canResizeRegions = !readOnly && Boolean(onRegionResize);
  // D-381: navegar (seek) vale fora do readOnly OU quando `seekable` (tela Final).
  const podeNavegar = !readOnly || seekable;
  const barras = useMemo(
    () => barrasDaOnda(waveformPayload, safeDuration, waveformSourceStartSec, waveformSourceEndSec, waveformDesvios),
    [safeDuration, waveformDesvios, waveformPayload, waveformSourceEndSec, waveformSourceStartSec],
  );
  const fracaoDaAgulha = Math.max(0, Math.min(1, currentTime / safeDuration));

  const seekFromPointer = useCallback(
    (event: { clientX: number }) => {
      const track = sceneTrackRef.current ?? layoutTrackRef.current;
      if (track) onSeek(secondsFromPointer(event, track, safeDuration));
    },
    [onSeek, safeDuration],
  );

  const startPlayheadDrag = (event: PointerEvent<HTMLElement>) => {
    if (!podeNavegar || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setPlayheadPointerId(event.pointerId);
    seekFromPointer(event);
  };

  // Clique no fundo vazio da pista = seek. Os blocos são botões filhos e tratam o próprio clique.
  const handleTrackClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!podeNavegar || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSeek(limitar((event.clientX - rect.left) / rect.width, 0, 1) * safeDuration);
  };

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) startPlayheadDrag(event);
  };

  useZoomPelaRoda(timelineViewportRef, innerContentRef, setZoom, readOnly);

  const handleRegionResizeStart = (
    event: PointerEvent<HTMLSpanElement>,
    index: number,
    edge: ResizeEdge,
    region: YoutubeLayoutRegion,
  ) => {
    const track = layoutTrackRef.current;
    if (!canResizeRegions || !track) return;
    event.preventDefault();
    event.stopPropagation();
    const next: RegionDragState = {
      index,
      edge,
      pointerId: event.pointerId,
      initialRegion: region,
      region: resizeRegionAt(region, edge, secondsFromPointer(event, track, safeDuration), safeDuration),
    };
    dragStateRef.current = next;
    setDragState(next);
    // I-029 v2: arrastar a aresta de uma região NÃO move a agulha (paridade com a Bruta).
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
    fetchWaveformPeaks(url)
      .then((payload) => {
        if (!cancelled) setWaveformPayload(payload);
      })
      .catch(() => {
        if (!cancelled) setWaveformPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [waveformCorteId]);

  useArrastoNaJanela(
    playheadPointerId != null,
    useCallback(
      (event) => {
        if (event.pointerId !== playheadPointerId) return;
        event.preventDefault();
        seekFromPointer(event);
      },
      [playheadPointerId, seekFromPointer],
    ),
    useCallback(
      (event) => {
        if (event.pointerId !== playheadPointerId) return;
        event.preventDefault();
        setPlayheadPointerId(null);
      },
      [playheadPointerId],
    ),
  );

  useArrastoNaJanela(
    dragState !== null,
    useCallback(
      (event) => {
        const current = dragStateRef.current;
        const track = layoutTrackRef.current;
        if (!current || !track || event.pointerId !== current.pointerId) return;
        event.preventDefault();
        const next = {
          ...current,
          region: resizeRegionAt(current.initialRegion, current.edge, secondsFromPointer(event, track, safeDuration), safeDuration),
        };
        dragStateRef.current = next;
        setDragState(next);
      },
      [safeDuration],
    ),
    useCallback(
      (event) => {
        const current = dragStateRef.current;
        if (!current || event.pointerId !== current.pointerId) return;
        event.preventDefault();
        dragStateRef.current = null;
        setDragState(null);
        onRegionResize?.(current.index, current.region);
      },
      [onRegionResize],
    ),
  );

  const gestos: GestosDaPista = {
    podeNavegar,
    readOnly,
    duracao: safeDuration,
    onSeek,
    aoClicarNoFundo: handleTrackClick,
    aoApertarNoFundo: handleTrackPointerDown,
    segundosSob: (event, pista) => secondsFromPointer(event, pista, safeDuration),
  };

  return (
    <section className="flex flex-shrink-0 flex-col overflow-hidden rounded-cartao border border-fio bg-painel-solido">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-fio px-3 py-2">
        <h2 className="text-linha text-fg">Linha do tempo</h2>
        <span className={cn('inline-flex items-center gap-1 text-pequeno', cenasRenderizadas ? 'text-ok' : 'text-fg-2')}>
          {cenasRenderizadas && <Icon name="check" />}
          {ordenadas.length} cenas
        </span>
        <span className={cn('inline-flex items-center gap-1 text-pequeno', palcoGerado ? 'text-ok' : 'text-fg-2')}>
          {palcoGerado ? (
            <>
              <Icon name="check" />
              palco gerado
            </>
          ) : (
            `${regioes.length} ${regioes.length === 1 ? 'região' : 'regiões'}`
          )}
        </span>
        <div className="flex-1" />
        {!readOnly && (
          <>
            {showAddButtons && (
              <div className="flex items-center gap-1">
                <Tooltip label="Adicionar regiao Compartilhada no tempo atual" side="bottom">
                  <button type="button" data-sala="" onClick={() => onAddRegion('compartilhada')} className={FERRAMENTA_TEXTO}>
                    <Icon name="plus" />
                    Comp.
                  </button>
                </Tooltip>
                <Tooltip label="Adicionar regiao Full no tempo atual" side="bottom">
                  <button type="button" data-sala="" onClick={() => onAddRegion('full')} className={FERRAMENTA_TEXTO}>
                    <Icon name="plus" />
                    Full
                  </button>
                </Tooltip>
              </div>
            )}
            {hasSelectedRegion && (
              <div className="flex items-center gap-1">
                <Tooltip label="[: ajusta o INICIO da regiao travada para o tempo atual" side="bottom">
                  <button
                    type="button"
                    data-sala=""
                    onClick={() => onAjustarInicioPinada?.()}
                    className={cn(FERRAMENTA_TEXTO, 'num')}
                    aria-label="Ajustar inicio da regiao travada"
                  >
                    [
                  </button>
                </Tooltip>
                <Tooltip label="]: ajusta o FIM da regiao travada para o tempo atual" side="bottom">
                  <button
                    type="button"
                    data-sala=""
                    onClick={() => onAjustarFimPinada?.()}
                    className={cn(FERRAMENTA_TEXTO, 'num')}
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
                data-sala=""
                onClick={() => setZoom((z) => zoomOut(z))}
                disabled={zoom <= ZOOM_MIN}
                aria-label="Diminuir zoom"
                className={FERRAMENTA_ICONE}
              >
                <Icon name="zoom-out" />
              </button>
            </Tooltip>
            <Tooltip label="Aumentar zoom (ou role o mouse sobre a timeline)" side="bottom">
              <button
                type="button"
                data-sala=""
                onClick={() => setZoom((z) => zoomIn(z))}
                disabled={zoom >= ZOOM_MAX}
                aria-label="Aumentar zoom"
                className={FERRAMENTA_ICONE}
              >
                <Icon name="zoom-in" />
              </button>
            </Tooltip>
          </>
        )}
      </header>

      {/* Corpo: rola na horizontal com zoom > 1. A roda com Ctrl dá o zoom (listener nativo, o do React é passivo). */}
      <div ref={timelineViewportRef} className="relative flex flex-col gap-1.5 overflow-x-auto px-3 py-2.5">
        <div ref={innerContentRef} className="relative min-w-[var(--zoom)]" style={{ '--zoom': `${zoom * 100}%` } as React.CSSProperties}>
          <AgulhaDaPos
            fracao={fracaoDaAgulha}
            tempoSeg={currentTime}
            arrastando={playheadPointerId !== null}
            onPointerDown={startPlayheadDrag}
          />

          <PistaDeCenas
            {...gestos}
            pistaRef={sceneTrackRef}
            cenas={ordenadas}
            corteId={waveformCorteId}
            ativaIdx={activeIdx}
            selecionadaIdx={selectedCenaIdx}
            onSelectCena={onSelectCena}
          />
          {waveformCorteId && ordenadas.length > 0 && <LegendaDaOrigem className="mb-1.5" />}
          <PistaDeLayout
            {...gestos}
            pistaRef={layoutTrackRef}
            regioes={displayedRegioes}
            selecionadaIdx={selectedRegionIdx}
            arrastandoIdx={dragState?.index}
            podeRedimensionar={canResizeRegions}
            segmentosDetectados={segmentosDetectados}
            detectando={detectandoSegmentos}
            onReprocessar={onReprocessarSegmentosDetectados}
            onSelectRegion={onSelectRegion}
            onSelectSegmentoDetectado={onSelectSegmentoDetectado}
            onComecarRedimensionar={handleRegionResizeStart}
          />
          <PistaDeAudio {...gestos} pistaRef={audioTrackRef} barras={barras} />

          {/* Régua de tempo: o mesmo sistema de coordenadas das pistas, para casar com os blocos. */}
          <div className="num text-micro mt-1.5 flex justify-between pl-[85px] pr-px text-fg-3">
            {timecodes.map((tc, idx) => (
              <span key={`tc-${idx}`}>{tc}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
