import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useFuncaoEstavel } from '@/hooks/useFuncaoEstavel';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { AlertaConferir, Desvio } from '@/types/models';
import { drawRegions, type RegionsInstance } from './regioesDaOnda';
import {
  ATRIBUTO_DA_AGULHA,
  TOKEN_DA_AGULHA,
  atualizarRotuloDaAgulha,
  criarRotuloDaAgulha,
  marcarSobAgulha,
  textoDaAgulha,
  trechoSobAgulha,
} from './agulhaDaOnda';
import { AlertasConferir } from './AlertasConferir';
import { LegendaDaTimeline } from './LegendaDaTimeline';
import type { PlayerHandle } from '@/hooks/useVideoPlayer';
import { Tooltip } from '@/components/ui/tooltip';
import { fetchWaveformPeaks } from '@/lib/api';
import { cn } from '@/lib/utils';
import { segParaHms, segParaMmSs } from '../timeUtils';
import { Icon } from '@/upgrade/Icon';
import { FERRAMENTA_ICONE, FERRAMENTA_TEXTO, FOCO, ITEM_DE_MENU, LIGADO, ROTULO_DE_GRUPO } from '../salaDoEditor';

// ─────────────────────────────────────────────────────────────
// TimelinePanel — header refatorado conforme
// `design_reference/src/v2_bruto.jsx:206-402` (BrutoTimelineV2).
// Toolbar enxuta + menu "⋮" (moreV) para zoom/lock/pointer/pin/smartplay.
// O corpo (Waveform interno + WaveSurfer) permanece o existente — apenas
// a toolbar foi redesenhada. Atalhos (`shortcuts.ts`) preservados.
//
// O cabecalho e o do upgrade de layout (D-599/D-610): tempo, transporte,
// In/Out, cadeado, velocidade e o menu ⚙ com dividir/juntar/trecho/onda.
// As variantes do legado e do Workbench sairam com as cascas (D-728).
// ─────────────────────────────────────────────────────────────

interface Props {
  audioSrc: string;
  waveformPeaksSrc: string;
  audioOffsetSec?: number;
  inicioSeg: number;
  fimSeg: number;
  desvios: Desvio[];
  /** D-998: trechos que ficam no corte e a IA pede para conferir. */
  alertas?: AlertaConferir[];
  corteId?: string;
  currentTime: number;
  playbackRate: number;
  playerRef?: RefObject<PlayerHandle | null>;
  onSeek: (seg: number) => void;
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
  // D-575: funde este corte com o proximo — a operacao inversa do dividir.
  onJuntarProximo?: () => void;
  juntando?: boolean;
  /** D-575: alterna entre 1x e a velocidade de trabalho (a ultima != 1x). */
  onAlternarVelocidade?: () => void;
  onGerarBruto?: () => void;
  brutoPronto?: boolean;
  brutoStatus?: 'idle' | 'processando' | 'concluido' | 'erro';
  /** D-412: inicio do proximo corte (segundos do video original) e o numero
   *  dele, para marcar na onda ate onde este corte pode ir. */
  proximoInicioSeg?: number;
  proximoNumero?: number;
}


// Estável: um `[]` novo a cada render redesenharia as regiões a cada tique.
const SEM_ALERTAS: AlertaConferir[] = [];
// D-1150 (§3.3): o que fica é aceso, sem véu; só um vidro leve marca a janela do corte.
const COR_DO_CORTE = 'var(--cc-vidro)';
const TIMECODE_SLOTS = 7;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 20;
const ZOOM_STEP_WHEEL = 1.1;
// AUDITORIA-v2 §7 (CP7): opcoes de velocidade do menu ⚙ do Workbench.
const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
// WaveSurfer aceita 'auto' para preencher o container, e a onda ocupa a altura
// do painel sem faixa cinza embaixo. O container precisa de altura pelo flex.

function queryShadow(container: HTMLElement | null, selector: string): HTMLElement | null {
  const host = container?.firstElementChild as HTMLElement | undefined;
  return (host?.shadowRoot?.querySelector(selector) as HTMLElement | null) ?? null;
}

// D-412 — marca do inicio do proximo corte na onda.
const ATRIBUTO_MARCA_PROXIMO = 'data-proximo-corte';

/**
 * Linha vertical tracejada que marca onde o proximo corte comeca. Tracejada e
 * na cor de erro para nao ser confundida com o cursor de reproducao (solido,
 * accent) nem com as regioes de trecho (blocos preenchidos): passar dela
 * significa invadir o corte vizinho.
 */
function criarMarcaProximoCorte(numero?: number): HTMLElement {
  const marca = document.createElement('div');
  marca.setAttribute(ATRIBUTO_MARCA_PROXIMO, '1');
  marca.title =
    numero === undefined ? 'Inicio do proximo corte' : `Inicio do proximo corte (#${numero})`;
  marca.style.cssText = [
    'position:absolute',
    'top:0',
    'bottom:0',
    'width:0',
    'border-left:2px dashed var(--cc-erro)',
    'pointer-events:none',
    'z-index:4',
  ].join(';');

  const bandeira = document.createElement('span');
  bandeira.textContent = numero === undefined ? 'próx.' : `#${numero}`;
  bandeira.style.cssText = [
    'position:absolute',
    'top:2px',
    'left:3px',
    'background:var(--cc-erro-cheio)',
    'color:var(--cc-sobre-erro)',
    'font-family:var(--font-mono)',
    'font-size:11px',
    'font-weight:700',
    'line-height:1',
    'padding:2px 3px',
    'border-radius:3px',
    'white-space:nowrap',
  ].join(';');
  marca.appendChild(bandeira);
  return marca;
}

function buildTimecodes(inicio: number, fim: number): string[] {
  if (!(fim > inicio)) return Array(TIMECODE_SLOTS).fill('00:00:00');
  const step = (fim - inicio) / (TIMECODE_SLOTS - 1);
  return Array.from({ length: TIMECODE_SLOTS }, (_, idx) => segParaHms(inicio + step * idx));
}

/** Põe alfa em qualquer cor (D-1128: com a ponte, `--wb-*` chega em hex, não em oklch).
 *  Mistura em oklab com o transparente; o canvas do wavesurfer lê `color-mix`. */
export function withAlpha(cor: string, alpha: number): string {
  if (!cor) return cor;
  return `color-mix(in oklab, ${cor} ${Math.round(alpha * 100)}%, transparent)`;
}

interface WaveformProps {
  audioSrc: string;
  waveformPeaksSrc: string;
  audioOffsetSec: number;
  inicioSeg: number;
  fimSeg: number;
  desvios: Desvio[];
  alertas: AlertaConferir[];
  currentTime: number;
  zoomLevel: number;
  locked: boolean;
  pointer: boolean;
  playerRef?: RefObject<PlayerHandle | null>;
  scrollToCursorNonce: number;
  onSeek: (seg: number) => void;
  onSelectDesvio?: (time: number) => void;
  onChangeDesvio?: (idx: number, inicio: string, fim: string) => void;
  onZoomChange: (next: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** D-412: inicio do PROXIMO corte, em segundos do video original. Marca uma
   *  linha na onda para a invasao do corte vizinho ficar visivel. Ausente
   *  quando este e o ultimo corte. */
  proximoInicioSeg?: number;
  /** Numero do proximo corte, so para rotular a marca. */
  proximoNumero?: number;
}

function Waveform({
  audioSrc,
  waveformPeaksSrc,
  audioOffsetSec,
  inicioSeg,
  fimSeg,
  desvios,
  alertas,
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
  proximoInicioSeg,
  proximoNumero,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLElement | null>(null);
  // D-1150: o trecho sob a agulha ganha o contorno `cc-aviso` (§7.3); -1 = no que fica.
  const sobAgulhaRef = useRef(-1);
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
    alertas,
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
    proximoInicioSeg,
  });
  latestRef.current = {
    audioOffsetSec,
    inicioSeg,
    fimSeg,
    desvios,
    alertas,
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
    proximoInicioSeg,
  };

  // D-412: linha do inicio do proximo corte. Vive DENTRO do wrapper do shadow
  // (como o cursor de reproducao), nao num overlay por fora — so ali ela
  // acompanha zoom e scroll horizontal da onda. Posicao em % da duracao,
  // mesmo eixo do cursor.
  useEffect(() => {
    let frame = 0;
    let marca: HTMLElement | null = null;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const ws = wsRef.current;
      if (!ws) return;

      const alvo = latestRef.current.proximoInicioSeg;
      const duracao = ws.getDuration();
      // Sem proximo corte (este e o ultimo) ou marca fora da janela da onda:
      // nao ha o que apontar, e uma linha grudada na borda so mentiria.
      const posicao =
        alvo === undefined || duracao <= 0
          ? -1
          : (alvo - latestRef.current.audioOffsetSec) / duracao;
      if (posicao < 0 || posicao > 1) {
        marca?.remove();
        marca = null;
        return;
      }

      // Cacheado como o cursor faz: `queryShadow` a cada frame seria varrer o
      // shadow 60x/s so para reposicionar um elemento que ja temos em maos.
      if (!marca?.isConnected) {
        const wrapper = queryShadow(containerRef.current, '.wrapper');
        if (!wrapper) return;
        marca = criarMarcaProximoCorte(proximoNumero);
        wrapper.appendChild(marca);
      }
      // D-659: este laço roda 60x/s mesmo com tudo parado. Reescrever o
      // mesmo `left` a cada frame invalida estilo à toa; compara com o que já
      // está no elemento (ler estilo inline não força layout).
      const left = `${posicao * 100}%`;
      if (marca.style.left !== left) marca.style.left = left;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      marca?.remove();
    };
  }, [proximoNumero]);

  useEffect(() => {
    if (!containerRef.current || !audioSrc) return;

    wsRef.current?.destroy();
    wsReadyRef.current = false;
    setIsLoading(true);
    latestRef.current.onLoadingChange?.(true);
    let cancelled = false;

    const root = getComputedStyle(document.documentElement);
    // D-1150: a agulha é traço claro (`--cc-foco`) e a onda usa o `--cc-fg-3`, lidos ao
    // vivo — funcionam em claro e escuro.
    const corDaAgulha = root.getPropertyValue(TOKEN_DA_AGULHA).trim() || '#ffffff';
    const dimColor = root.getPropertyValue('--cc-fg-3').trim();
    const waveColor = withAlpha(dimColor || 'gray', 0.85);
    const progressColor = withAlpha(dimColor || 'gray', 0.42);

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      cursorColor: corDaAgulha,
      cursorWidth: 2,
      barWidth: 1.5,
      barGap: 0.6,
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
      const l = latestRef.current;
      drawRegions(regions, l.inicioSeg, l.fimSeg, l.desvios, l.audioOffsetSec, l.locked, l.alertas, COR_DO_CORTE);
      requestAnimationFrame(() => {
        const cursor = queryShadow(containerRef.current, '.cursor');
        cursorRef.current = cursor;
        if (!cursor || cursor.querySelector(`[${ATRIBUTO_DA_AGULHA}]`)) return;
        cursor.style.overflow = 'visible';
        cursor.appendChild(criarRotuloDaAgulha());
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
  }, [audioSrc, waveformPeaksSrc]);

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
        if (cursor && !cursor.querySelector(`[${ATRIBUTO_DA_AGULHA}]`)) {
          cursor.style.overflow = 'visible';
          cursor.appendChild(criarRotuloDaAgulha());
        }
      }
      if (!cursor) return;
      const duration = ws.getDuration();
      if (duration <= 0) return;
      const player = latestRef.current.playerRef?.current;
      const videoTime = player ? player.getCurrentTime() : latestRef.current.currentTime;
      const wsTime = videoTime - latestRef.current.audioOffsetSec;
      const progress = Math.max(0, Math.min(1, wsTime / duration));
      // D-659: só escreve quando a posição muda. Compara com o DOM, e não com
      // o último valor escrito aqui: o wavesurfer também move o cursor (clique
      // na onda), e uma cópia local ficaria velha — o cursor grudaria.
      const left = `${progress * 100}%`;
      if (cursor.style.left !== left) cursor.style.left = left;
      atualizarRotuloDaAgulha(cursor, textoDaAgulha(videoTime, latestRef.current.inicioSeg));
      const sob = trechoSobAgulha(latestRef.current.desvios, videoTime);
      if (sob !== sobAgulhaRef.current) {
        sobAgulhaRef.current = sob;
        marcarSobAgulha(regionsRef.current?.getRegions() ?? [], sob);
      }

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
    drawRegions(regions, inicioSeg, fimSeg, desvios, audioOffsetSec, locked, alertas, COR_DO_CORTE);
  }, [inicioSeg, fimSeg, desvios, audioOffsetSec, locked, alertas]);

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
    <div ref={wrapperRef} className="relative flex h-full flex-col overflow-hidden rounded-campo border border-fio bg-poco">
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-campo bg-poco font-mono text-micro text-fg-3">
          carregando áudio…
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn('absolute inset-0', pointer ? 'cursor-crosshair' : dragging ? 'cursor-grabbing' : 'cursor-grab')}
        />
        {!pointer && (
          <div
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanUp}
            onPointerCancel={onPanUp}
            className={cn('absolute inset-0 z-[5] touch-none bg-transparent', dragging ? 'cursor-grabbing' : 'cursor-grab')}
          />
        )}
      </div>

      <div className="flex h-4 flex-none items-center justify-between border-t border-fio bg-painel-solido px-2 font-mono text-micro text-fg-3">
        {timecodes.map((timecode, idx) => (
          <span key={`tc-${idx}`}>{timecode}</span>
        ))}
      </div>
    </div>
  );
}

// ───── Componentes UI da toolbar (replicam Btn/IconBtn do design) ─────

const TransportGroup = memo(function TransportGroup({
  onSkipStart,
  onPlay,
  onSkipEnd,
}: {
  onSkipStart: () => void;
  onPlay: () => void;
  onSkipEnd: () => void;
}) {
  // D-610: só início, play e fim — o ±5s já mora nas setas do teclado.
  // D-1150 (§7.3): tocar é o círculo claro; início e fim são ferramentas fantasma.
  return (
    <div className="flex items-center gap-1">
      <Tooltip label="Inicio do corte" side="bottom">
        <button type="button" data-sala="" onClick={onSkipStart} aria-label="Inicio" className={FERRAMENTA_ICONE}>
          <Icon name="chevrons-left" />
        </button>
      </Tooltip>
      <Tooltip label="Play/Pause" side="bottom">
        <button
          type="button"
          data-sala=""
          onClick={onPlay}
          aria-label="Play/Pause"
          className={`inline-grid size-8 place-items-center rounded-pilula bg-fg text-app shadow-topo transition-transform duration-[120ms] active:scale-[.97] motion-reduce:transition-none ${FOCO}`}
        >
          <Icon name="play" />
        </button>
      </Tooltip>
      <Tooltip label="Fim do corte" side="bottom">
        <button type="button" data-sala="" onClick={onSkipEnd} aria-label="Fim" className={FERRAMENTA_ICONE}>
          <Icon name="chevrons-right" />
        </button>
      </Tooltip>
    </div>
  );
});

// D-575: a pilula da velocidade virou GATILHO. Afinar a borda de um corte
// pede ouvir devagar; conferir o resultado pede 1x — e a ida e volta era sempre
// entre esses dois valores, custando varios Ctrl+J/K por troca. Clicar alterna
// direto. Sem `onAlternar` ela continua sendo o indicador nao-clicavel de antes
// (v2_bruto.jsx:236-255), preservando o variant legacy.
function SpeedDisplay({
  playbackRate,
  onAlternar,
}: {
  playbackRate: number;
  onAlternar?: () => void;
}) {
  // D-871: sem âmbar — velocidade é um ajuste, não um aviso.
  const classes =
    'inline-flex h-7 items-center gap-1 rounded-pilula border border-fio bg-poco px-2.5 font-mono text-micro tabular-nums text-fg';
  const rotulo = <><Icon name="gauge" />{playbackRate.toFixed(2)}×</>;

  if (!onAlternar) {
    return (
      <Tooltip label="Velocidade atual (use Ctrl + J/K)" side="bottom">
        <span className={classes}>
          {rotulo}
        </span>
      </Tooltip>
    );
  }

  const normal = Math.abs(playbackRate - 1) < 0.01;
  return (
    <Tooltip
      label={
        normal
          ? 'Voltar para a velocidade de trabalho (Ctrl+U)'
          : 'Voltar para 1,00× (Ctrl+U)'
      }
      side="bottom"
    >
      <button
        type="button"
        onClick={onAlternar}
        data-sala=""
        aria-label="Alternar velocidade"
        className={cn(classes, 'transition-colors duration-150 hover:border-campo motion-reduce:transition-none', FOCO)}
      >
        {rotulo}
      </button>
    </Tooltip>
  );
}

interface PosicaoMenu {
  /** Ancora vertical: `top` quando abre para baixo, `bottom` quando abre para cima. */
  top?: number;
  bottom?: number;
  right: number;
  /** Altura maxima ja descontada da ancora — o menu rola em vez de vazar. */
  maxHeight: number;
}

const MENU_MARGEM = 6;
const MENU_RESPIRO_TELA = 12;
// Altura do menu cheio (zoom, velocidade, os 4 toggles e as 4 acoes de corte).
// Serve so para decidir o LADO — a altura real e limitada pelo espaco medido.
const MENU_ALTURA_NATURAL = 480;

/**
 * Onde a gaveta do ⚙ cabe: abaixo do botao, ou acima quando nao ha espaco.
 *
 * D-575 — antes o menu era sempre ancorado em `top: rect.bottom` com
 * `maxHeight: calc(100vh - 100px)`: um teto que ignora a POSICAO do botao. Como a
 * timeline mora no rodape da tela, o menu nascia ja passando do fim da janela e
 * so dava para ler o fim dele tirando o zoom do navegador.
 *
 * A regra agora tem dois passos, nessa ordem:
 *
 * 1. Se o menu INTEIRO cabe abaixo, abre abaixo — e o sentido natural de uma
 *    gaveta, e trocar de lado sem precisar seria desorientador.
 * 2. Senao, vai para o lado com mais espaco. Com a timeline no rodape isso quase
 *    sempre significa abrir para CIMA, onde sobra a tela toda.
 *
 * Em qualquer caso a altura maxima e o espaco REAL daquele lado, entao o menu
 * rola dentro de si em vez de vazar pela janela.
 */
function posicionarMenu(rect: DOMRect, alturaTela: number, larguraTela: number): PosicaoMenu {
  const right = larguraTela - rect.right;
  const abaixo = alturaTela - rect.bottom - MENU_MARGEM - MENU_RESPIRO_TELA;
  const acima = rect.top - MENU_MARGEM - MENU_RESPIRO_TELA;

  const cabeAbaixo = abaixo >= MENU_ALTURA_NATURAL;
  if (!cabeAbaixo && acima > abaixo) {
    return { bottom: alturaTela - rect.top + MENU_MARGEM, right, maxHeight: Math.max(acima, 0) };
  }
  return { top: rect.bottom + MENU_MARGEM, right, maxHeight: Math.max(abaixo, 0) };
}

/** A posição medida do menu entra só como variável de geometria (DIRECAO §9.3). */
function posicaoDoMenu(pos: PosicaoMenu): CSSProperties {
  const px = (n?: number) => (n === undefined ? 'auto' : `${n}px`);
  return {
    '--topo': px(pos.top),
    '--base': px(pos.bottom),
    '--direita': px(pos.right),
    '--altura': px(pos.maxHeight),
  } as CSSProperties;
}

// AdvancedMenu — auto-contido, renderiza via createPortal pra escapar
// do overflow:hidden dos containers (Panel/react-resizable-panels) e nao
// ficar cortado. Position:fixed calculado pelo bounding rect do botao.
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
  playbackRate,
  onChangeSpeed,
  onDividirAqui,
  dividindo,
  onJuntarProximo,
  juntando,
  onAddSegment,
  onRefreshAudio,
  refreshing,
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
  // AUDITORIA-v2 §7 (CP7): velocidade
  // clicavel (chama o MESMO onChangeSpeed de Ctrl+J/K) + dividir/trecho/
  // atualizar-onda, migrados dos botoes soltos do header pro menu.
  playbackRate?: number;
  onChangeSpeed?: (delta: number) => void;
  onDividirAqui?: () => void;
  dividindo?: boolean;
  onJuntarProximo?: () => void;
  juntando?: boolean;
  onAddSegment?: () => void;
  onRefreshAudio?: () => void;
  refreshing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PosicaoMenu | null>(null);
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
      setPos(posicionarMenu(btn.getBoundingClientRect(), window.innerHeight, window.innerWidth));
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
  const item = ITEM_DE_MENU;
  const kbd = 'font-mono text-micro text-fg-3';

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
          data-sala=""
          className={cn(FERRAMENTA_ICONE, open && 'bg-vidro-3 text-fg')}
        >
          <Icon name="settings" />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            data-sala=""
            style={posicaoDoMenu(pos)}
            className="fixed bottom-[var(--base)] right-[var(--direita)] top-[var(--topo)] z-[100] flex max-h-[var(--altura)] w-[240px] flex-col gap-0.5 overflow-y-auto rounded-bloco border border-fio-2 bg-pop p-2 text-fg shadow-pop-luz"
          >
            <div className={ROTULO_DE_GRUPO}>Avançado</div>
            {onChangeSpeed && playbackRate !== undefined && (
              <>
                <div className={ROTULO_DE_GRUPO}>Velocidade</div>
                <div className="grid grid-cols-4 gap-1 px-2 pb-1.5">
                  {SPEED_OPTIONS.map((speed) => {
                    const active = Math.abs(speed - playbackRate) < 0.01;
                    return (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => {
                          close();
                          onChangeSpeed(speed - playbackRate);
                        }}
                        aria-pressed={active}
                        data-sala=""
                        className={cn(
                          'rounded-pilula py-1 text-center font-mono text-micro transition-colors duration-150 motion-reduce:transition-none',
                          FOCO,
                          active
                            ? 'bg-iris text-sobre-iris'
                            : 'bg-poco text-fg-2 hover:text-fg',
                        )}
                      >
                        {speed}×
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                close();
                onZoomOut();
              }}
              data-sala="" className={item}
            >
              <Icon name="zoom-out" className="text-fg-2" />
              <span className="flex-1">Diminuir zoom</span>
              <span className={kbd}>Ctrl + −</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onZoomIn();
              }}
              data-sala="" className={item}
            >
              <Icon name="zoom-in" className="text-fg-2" />
              <span className="flex-1">Aumentar zoom</span>
              <span className={kbd}>Ctrl + +</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onToggleSmartPlay?.();
              }}
              data-sala="" className={item}
              aria-pressed={!!smartPlay}
            >
              <Icon name="scissors" className={smartPlay ? 'text-iris' : 'text-fg-2'} />
              <span className="flex-1">Reproducao sem trechos{smartPlay ? ' · ativo' : ''}</span>
              <span className={kbd}>Ctrl + B</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onTogglePointer?.();
              }}
              data-sala="" className={item}
              aria-pressed={!!pointer}
            >
              <Icon name="mouse-pointer-2" className={pointer ? 'text-iris' : 'text-fg-2'} />
              <span className="flex-1">{pointer ? 'Modo ponteiro · ativo' : 'Modo ponteiro'}</span>
              <span className={kbd}>Ctrl + P</span>
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onToggleLocked?.();
              }}
              data-sala="" className={item}
              aria-pressed={!!locked}
            >
              {locked ? (
                <Icon name="lock" className="text-iris" />
              ) : (
                <Icon name="unlock" className="text-fg-2" />
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
                data-sala="" className={item}
                aria-pressed={!!pinned}
              >
                <Icon name="pin" className={pinned ? 'text-iris' : 'text-fg-2'} />
                <span className="flex-1">
                  {pinned ? 'Liberar altura' : 'Fixar altura da timeline'}
                </span>
              </button>
            )}
            {(onDividirAqui || onJuntarProximo || onAddSegment || onRefreshAudio) && (
              <>
                <div className="my-1 h-px bg-fio" />
                {onDividirAqui && (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onDividirAqui();
                    }}
                    disabled={dividindo}
                    data-sala="" className={item}
                  >
                    <Icon name="split-square-horizontal" className="text-fg-2" />
                    <span className="flex-1">Dividir corte aqui</span>
                    <span className={kbd}>D</span>
                  </button>
                )}
                {onJuntarProximo && (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onJuntarProximo();
                    }}
                    disabled={juntando}
                    data-sala="" className={item}
                  >
                    <Icon name="merge" className="text-fg-2" />
                    <span className="flex-1">Juntar com o proximo corte</span>
                    <span className={kbd}>^⌥J</span>
                  </button>
                )}
                {onAddSegment && (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onAddSegment();
                    }}
                    data-sala="" className={item}
                  >
                    <Icon name="plus" className="text-fg-2" />
                    <span className="flex-1">Trecho aqui</span>
                    <span className={kbd}>Ctrl+Alt+T</span>
                  </button>
                )}
                {onRefreshAudio && (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onRefreshAudio();
                    }}
                    disabled={refreshing}
                    data-sala="" className={item}
                  >
                    <Icon name="rotate-cw" className={cn('text-fg-2', refreshing && 'animate-spin')} />
                    <span className="flex-1">
                      {refreshing ? 'Atualizando onda…' : 'Atualizar onda de áudio'}
                    </span>
                  </button>
                )}
              </>
            )}
            <div className="my-1 h-px bg-fio" />
            <div className="px-2 py-0.5 font-mono text-micro text-fg-3">
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
  alertas = SEM_ALERTAS,
  corteId,
  currentTime,
  playbackRate,
  playerRef,
  waveformPeaksSrc: _waveformPeaksSrc,
  onSeek,
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
  onJuntarProximo,
  juntando,
  onAlternarVelocidade,
  onChangeSpeed,
  proximoInicioSeg,
  proximoNumero,
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

  // D-740: o transporte não muda com o tempo; handlers estáveis deixam o memo
  // dele segurar a redesenhada a cada tique do player.
  const irParaInicio = useFuncaoEstavel(() => handleSeek(inicioSeg));
  const irParaFim = useFuncaoEstavel(() => handleSeek(fimSeg));
  const alternarPlay = useFuncaoEstavel(handlePlayPause);
  const zoomLabel = `${zoomLevel.toFixed(1)}×`;
  const rateLabel = `${playbackRate.toFixed(2)}×`;
  // AUDITORIA-v2 §7 (CP7): tempo decorrido/total relativo ao INICIO DO CORTE, como o
  // "NO CORTE" do BrutoContextStrip. Só um rótulo: não mexe no cursor nem na onda.
  const tempoLabel = `${segParaMmSs(Math.max(0, currentTime - inicioSeg), true)} / ${segParaMmSs(Math.max(0, fimSeg - inicioSeg), true)}`;

  return (
    <section className="flex h-full flex-col overflow-visible rounded-cartao border border-fio bg-painel-solido">
      {/* Header — v2_bruto.jsx:209-329 (Panel + toolbar) */}
      {/* Em coluna estreita o cabecalho quebra em duas linhas em vez de
          esconder o ⚙. */}
      <header className="m-2 flex flex-shrink-0 flex-wrap items-center gap-2 rounded-pilula border border-fio bg-poco px-2 py-1">
        {/* AUDITORIA-v2 §7 (CP7): tempo, transporte, In/Out, cadeado e o menu ⚙.
            Velocidade/dividir/trecho/onda foram para o AdvancedMenu; o badge de
            trechos saiu (já aparece em Tempos/CP6). */}
        {/* D-610: na casca nova o transporte voltou para cá. A barra própria
            acima gastava uma linha inteira do player para cinco controles
            que cabem folgados neste cabeçalho. */}
        <span className="flex-none pl-2 font-mono text-micro tabular-nums text-fg-2">{tempoLabel}</span>

        <TransportGroup onSkipStart={irParaInicio} onPlay={alternarPlay} onSkipEnd={irParaFim} />

        {/* D-871: neutros, com a tecla no rótulo — só marcam um ponto. */}
        <Tooltip label="Marcar o início do corte aqui ( [ )" side="bottom">
          <button
            type="button"
            onClick={onSetInicioAqui}
            disabled={!onSetInicioAqui}
            aria-label="Marcar inicio aqui"
            data-sala=""
            className={FERRAMENTA_TEXTO}
          >
            <span className="font-mono font-semibold">[</span>
            Início aqui
          </button>
        </Tooltip>
        <Tooltip label="Marcar o fim do corte aqui ( ] )" side="bottom">
          <button
            type="button"
            onClick={onSetFimAqui}
            disabled={!onSetFimAqui}
            aria-label="Marcar fim aqui"
            data-sala=""
            className={FERRAMENTA_TEXTO}
          >
            Fim aqui
            <span className="font-mono font-semibold">]</span>
          </button>
        </Tooltip>

        <Tooltip
          label={locked ? 'Destravar trecho (Ctrl+L)' : 'Travar trecho (Ctrl+L)'}
          side="bottom"
        >
          <button
            type="button"
            onClick={toggleLocked}
            aria-pressed={locked}
            aria-label={locked ? 'Destravar trecho' : 'Travar trecho'}
            data-sala=""
            className={cn(FERRAMENTA_ICONE, LIGADO)}
          >
            {locked ? <Icon name="lock" /> : <Icon name="unlock" />}
          </button>
        </Tooltip>

        <div className="flex-1" />

        {/* D-402: a velocidade em vigor precisa ser legivel sem abrir o ⚙.
            O CP7 mandou o CONTROLE pro AdvancedMenu; aqui volta so o
            INDICADOR (pill nao-clicavel), como no header legacy. */}
        <SpeedDisplay playbackRate={playbackRate} onAlternar={onAlternarVelocidade} />

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
          playbackRate={playbackRate}
          onChangeSpeed={onChangeSpeed}
          onDividirAqui={onDividirAqui}
          dividindo={dividindo}
          onJuntarProximo={onJuntarProximo}
          juntando={juntando}
          onAddSegment={handleAddSegment}
          onRefreshAudio={onAtualizarAudioTimeline ? handleRefreshAudio : undefined}
          refreshing={audioRefreshing}
        />
      </header>

      {corteId && <AlertasConferir corteId={corteId} alertas={alertas} onSeek={handleSeek} />}

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        <Waveform
          audioSrc={audioSrc}
          waveformPeaksSrc={_waveformPeaksSrc}
          audioOffsetSec={audioOffsetSec}
          inicioSeg={inicioSeg}
          fimSeg={fimSeg}
          currentTime={currentTime}
          desvios={desvios}
          alertas={alertas}
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
          proximoInicioSeg={proximoInicioSeg}
          proximoNumero={proximoNumero}
        />
        <LegendaDaTimeline corDoCorte={COR_DO_CORTE} />
      </div>
    </section>
  );
}
