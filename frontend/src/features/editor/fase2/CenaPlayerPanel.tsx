import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Player, type PlayerRef } from '@remotion/player';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import type { CenaRemotion, FontePreset } from '@/types/models';
import type { PlayerHandle } from '@/hooks/useVideoPlayer';
import { metaCena } from './sceneTypes';
import { segParaMmSs } from '../timeUtils';
import { CenasRemotionPreview, type SombraNivelPadrao } from './CenasRemotionPreview';
import { buildCenaVisualRevision, type LayoutCardPadrao } from './cardPreviewContracts';
import { resolveYoutubeModeAt, type YoutubeLayout } from './youtubeLayout';

const FPS = 30;

const clampFrame = (frame: number, durationInFrames: number) =>
  Math.max(0, Math.min(Math.round(frame), Math.max(0, durationInFrames - 1)));

interface Props {
  src: string;
  cenas: CenaRemotion[];
  durationSeg: number;
  offsetSeg?: number;
  onTimeUpdate: (t: number) => void;
  modoLabel: string;
  onAbrirStudio: () => void;
  abrindoStudio: boolean;
  sombraNivelPadrao?: SombraNivelPadrao;
  layoutCardPadrao?: LayoutCardPadrao;
  fontPreset?: FontePreset;
  layoutYoutube?: YoutubeLayout;
  playbackRate?: number;
  /** Toggle (I-029): false esconde cenas + layout YT no Remotion Player,
   * mostrando o video bruto cru. Atalho Ctrl+Alt+R no EditorFase2. */
  remotionEnabled?: boolean;
  onToggleRemotion?: () => void;
}

export const CenaPlayerPanel = forwardRef<PlayerHandle, Props>(function CenaPlayerPanel(
  {
    src,
    cenas,
    durationSeg,
    offsetSeg = 0,
    onTimeUpdate,
    modoLabel,
    onAbrirStudio,
    abrindoStudio,
    sombraNivelPadrao,
    layoutCardPadrao,
    fontPreset,
    layoutYoutube,
    playbackRate,
    remotionEnabled = true,
    onToggleRemotion,
  },
  ref,
) {
  const playerRef = useRef<PlayerRef>(null);
  const lastFrameRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);

  const durationInFrames = useMemo(() => {
    const fromCorte = Math.ceil(Math.max(0, durationSeg) * FPS);
    const fromCenas = cenas.reduce((max, cena) => Math.max(max, cena.fim * FPS), 0);
    return Math.max(1, Math.ceil(Math.max(fromCorte, fromCenas)));
  }, [durationSeg, cenas]);

  const cenasOcultas = !remotionEnabled;
  const inputProps = useMemo(
    () => ({
      videoSrc: src,
      cenas,
      sombraNivelPadrao,
      layoutCardPadrao,
      fontPreset,
      layoutYoutube,
      cenasOcultas,
    }),
    [src, cenas, sombraNivelPadrao, layoutCardPadrao, fontPreset, layoutYoutube, cenasOcultas],
  );

  const visualRevision = useMemo(() => buildCenaVisualRevision(cenas), [cenas]);

  // I-029 v2: layoutYoutube saiu do playerKey porque o Remotion Player
  // propaga mudancas via `inputProps` sem precisar remontar — e o remount
  // pausava o video toda vez que o usuario adicionava/editava uma regiao
  // ("vira e mexe ao clicar na timeline ela fica pausando").
  const playerKey = useMemo(
    () =>
      [
        src,
        sombraNivelPadrao ?? 'nenhuma',
        layoutCardPadrao ?? 'vertical',
        fontPreset ?? 'atual',
        visualRevision,
        cenasOcultas ? 'raw' : 'remotion',
      ].join('-'),
    [src, sombraNivelPadrao, layoutCardPadrao, fontPreset, visualRevision, cenasOcultas],
  );
  const initialFrame = clampFrame(lastFrameRef.current, durationInFrames);

  const handle = useMemo<PlayerHandle>(
    () => ({
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      togglePlay: () => {
        const p = playerRef.current;
        if (!p) return;
        if (p.isPlaying()) p.pause();
        else p.play();
      },
      seekTo: (seg) => {
        const p = playerRef.current;
        if (!p) return;
        const next = clampFrame(seg * FPS, durationInFrames);
        lastFrameRef.current = next;
        // I-029 v2: preserva o estado de play. O Remotion Player as vezes
        // pausa em `seekTo` (em especial quando chamado rapidamente em
        // drag-scrub do playhead). Restaurar `play()` quando estava
        // tocando mantem a reproducao continua durante o arrasto.
        const wasPlaying = p.isPlaying();
        p.seekTo(next);
        if (wasPlaying && !p.isPlaying()) {
          p.play();
        }
      },
      step: (delta) => {
        const p = playerRef.current;
        if (!p) return;
        const next = clampFrame(p.getCurrentFrame() + delta * FPS, durationInFrames);
        lastFrameRef.current = next;
        const wasPlaying = p.isPlaying();
        p.seekTo(next);
        if (wasPlaying && !p.isPlaying()) {
          p.play();
        }
      },
      setPlaybackRate: () => {
        // @remotion/player não expõe playbackRate via PlayerRef — controle vem dos controls nativos.
      },
      getPlaybackRate: () => 1,
      getCurrentTime: () => (playerRef.current?.getCurrentFrame() ?? lastFrameRef.current) / FPS,
      isPlaying: () => playerRef.current?.isPlaying() ?? false,
    }),
    [durationInFrames],
  );

  useImperativeHandle(ref, () => handle, [handle]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (event: { detail: { frame: number } }) => {
      const frame = clampFrame(event.detail.frame, durationInFrames);
      lastFrameRef.current = frame;
      const t = frame / FPS;
      setCurrentTime(t);
      onTimeUpdate(t);
    };
    p.addEventListener('frameupdate', onFrame);
    return () => {
      p.removeEventListener('frameupdate', onFrame);
    };
  }, [durationInFrames, onTimeUpdate, playerKey]);

  const { cenaAtiva, proximaCena } = useMemo(() => {
    const t = currentTime + offsetSeg;
    const ordenadas = [...cenas].sort((a, b) => a.inicio - b.inicio);
    const ativa = ordenadas.find((cena) => t >= cena.inicio && t <= cena.fim) ?? null;
    const proxima = ativa ? null : (ordenadas.find((cena) => cena.inicio > t) ?? null);
    return { cenaAtiva: ativa, proximaCena: proxima };
  }, [cenas, currentTime, offsetSeg]);

  const cenaAtivaLabel = cenaAtiva ? metaCena(cenaAtiva.tipo).label : null;
  const proximaLabel = proximaCena ? metaCena(proximaCena.tipo).label : null;
  const segundosParaProxima = proximaCena
    ? Math.max(0, proximaCena.inicio - (currentTime + offsetSeg))
    : null;
  const layoutAtivo = layoutYoutube
    ? resolveYoutubeModeAt(layoutYoutube, currentTime + offsetSeg)
    : 'full';

  const handleAbrirStudio = useCallback(() => onAbrirStudio(), [onAbrirStudio]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <div className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          preview final
        </span>
        <span className="rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1.5 py-0.5 font-code text-[10.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          Remotion
        </span>
        <div className="flex-1" />
        <span className="font-code text-[11px] tabular-nums text-[var(--wb-text-dim)]">
          t={segParaMmSs(currentTime, true)}
        </span>
        <span className="font-code text-[10.5px] uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
          ·
        </span>
        {cenaAtiva ? (
          <span className="rounded-full bg-emerald-400 px-2 py-0.5 font-code text-[10.5px] font-bold text-emerald-950">
            cena: {cenaAtivaLabel}
          </span>
        ) : proximaCena ? (
          <span
            className="rounded-full border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 py-0.5 font-code text-[10.5px] text-[var(--wb-text-mute)]"
            title={`Próxima: ${proximaLabel} em ${segParaMmSs(proximaCena.inicio, true)}`}
          >
            próx: {proximaLabel} em {segundosParaProxima!.toFixed(1)}s
          </span>
        ) : (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-code text-[10.5px] text-amber-300">
            sem cenas {cenas.length === 0 ? '(0 carregadas)' : ''}
          </span>
        )}
        <span className="rounded-full border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 py-0.5 font-code text-[10.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          {layoutAtivo === 'compartilhada' ? 'compartilhada' : 'full'}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <Player
          // Remount visual atualiza preview; initialFrame preserva tempo atual.
          key={playerKey}
          ref={playerRef}
          component={CenasRemotionPreview as unknown as ComponentType<Record<string, unknown>>}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          initialFrame={initialFrame}
          fps={FPS}
          compositionWidth={1920}
          compositionHeight={1080}
          playbackRate={playbackRate ?? 1}
          controls
          clickToPlay
          doubleClickToFullscreen
          acknowledgeRemotionLicense
          style={{ width: '100%', height: '100%' }}
        />

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white backdrop-blur">
            {modoLabel}
          </span>
          {cenasOcultas && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-amber-100 backdrop-blur">
              Bruto · sem cenas
            </span>
          )}
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-2">
          {onToggleRemotion && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleRemotion}
              aria-pressed={!cenasOcultas}
              title={
                cenasOcultas
                  ? 'Mostrar cenas + layout YT (Ctrl+Alt+R)'
                  : 'Mostrar so o video bruto (Ctrl+Alt+R)'
              }
              className="border-white/20 bg-black/70 text-white backdrop-blur hover:bg-black/80"
            >
              {cenasOcultas ? <EyeOff size={14} /> : <Eye size={14} />}
              Remotion {cenasOcultas ? 'off' : 'on'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAbrirStudio}
            disabled={abrindoStudio}
            className="border-white/20 bg-black/70 text-white backdrop-blur hover:bg-black/80"
          >
            {abrindoStudio ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ExternalLink size={14} />
            )}
            Studio Remotion
          </Button>
        </div>
      </div>
    </section>
  );
});
