import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import type { CenaRemotion, FontePreset } from '@/types/models';
import type { PlayerHandle } from '@/hooks/useVideoPlayer';
import { metaCena } from './sceneTypes';
import { segParaMmSs } from '../timeUtils';
import { CenasRemotionPreview, type SombraNivelPadrao } from './CenasRemotionPreview';
import { buildCenaVisualRevision, type LayoutCardPadrao } from './cardPreviewContracts';
import { resolveYoutubeModeAt, type YoutubeLayout } from '@/shared/palco/youtubeLayout';
import { useTempoDoPlayer, type RelogioDoPlayer } from './relogioDoPlayer';
import { Icon } from '@/upgrade/Icon';
import { usePalcoDoCanalAtivoResolvido } from '@/features/channels/useChannels';

const FPS = 30;

const clampFrame = (frame: number, durationInFrames: number) =>
  Math.max(0, Math.min(Math.round(frame), Math.max(0, durationInFrames - 1)));

interface Props {
  src: string;
  cenas: CenaRemotion[];
  durationSeg: number;
  offsetSeg?: number;
  /** D-657: onde o frame corrente é publicado, 30 vezes por segundo. */
  relogio: RelogioDoPlayer;
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
    relogio,
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

  const durationInFrames = useMemo(() => {
    const fromCorte = Math.ceil(Math.max(0, durationSeg) * FPS);
    const fromCenas = cenas.reduce((max, cena) => Math.max(max, cena.fim * FPS), 0);
    return Math.max(1, Math.ceil(Math.max(fromCorte, fromCenas)));
  }, [durationSeg, cenas]);

  const cenasOcultas = !remotionEnabled;
  // D-911: o palco do canal ativo entra pelos inputProps, como o layout.
  const palco = usePalcoDoCanalAtivoResolvido();
  const inputProps = useMemo(
    () => ({ videoSrc: src, cenas, sombraNivelPadrao, layoutCardPadrao, fontPreset, layoutYoutube, cenasOcultas, palco }),
    [src, cenas, sombraNivelPadrao, layoutCardPadrao, fontPreset, layoutYoutube, cenasOcultas, palco],
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
      // D-657: publica no relógio em vez de subir por estado — antes, cada
      // frame re-renderizava este painel (e o Player junto) e a página inteira.
      relogio.marcar(frame / FPS);
    };
    p.addEventListener('frameupdate', onFrame);
    return () => {
      p.removeEventListener('frameupdate', onFrame);
    };
  }, [durationInFrames, relogio, playerKey]);

  const handleAbrirStudio = useCallback(() => onAbrirStudio(), [onAbrirStudio]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-cartao border border-fio bg-painel-solido">
      <div className="flex items-center gap-2 border-b border-fio px-3 py-2">
        <span className="text-linha text-fg">Prévia</span>
        <div className="flex-1" />
        <CabecalhoDoTempo
          relogio={relogio}
          cenas={cenas}
          offsetSeg={offsetSeg}
          layoutYoutube={layoutYoutube}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-app">
        <Player
          // Remount visual atualiza preview; initialFrame preserva tempo atual.
          key={playerKey}
          ref={playerRef}
          component={CenasRemotionPreview}
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
          className="size-full"
        />

        {/* A legenda sobre o vídeo é sólida: a Pós toca vídeo e não tem blur (DIRECAO §3.6). */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-pilula bg-painel-solido px-2.5 py-1 text-pequeno font-semibold text-fg">
            {modoLabel}
          </span>
          {cenasOcultas && (
            <span className="rounded-pilula bg-painel-solido px-2.5 py-1 text-pequeno font-semibold text-aviso">
              Bruto · sem cenas
            </span>
          )}
        </div>
      </div>

      {/* O transporte da prévia mora embaixo do vídeo, não por cima dele (DIRECAO §7.4). */}
      <div className="flex flex-wrap items-center gap-2 border-t border-fio px-3 py-2">
        {onToggleRemotion && (
          <span title="Mostrar cenas e layout, ou só o vídeo bruto (Ctrl+Alt+R)">
            <Segmented
              aria-label="O que a prévia mostra"
              value={cenasOcultas ? 'video' : 'cenas'}
              onValueChange={(v) => {
                if ((v === 'video') !== cenasOcultas) onToggleRemotion();
              }}
              opcoes={[
                { valor: 'cenas', rotulo: 'Com cenas' },
                { valor: 'video', rotulo: 'Só o vídeo' },
              ]}
            />
          </span>
        )}
        <div className="flex-1" />
        <Button type="button" variant="fantasma" size="pq" onClick={handleAbrirStudio} disabled={abrindoStudio}>
          {abrindoStudio ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="external-link" />}
          Abrir no Remotion Studio
        </Button>
      </div>
    </section>
  );
});

/**
 * D-657: o cabeçalho do preview é o único trecho deste painel que muda a cada
 * frame (timecode, cena ativa, contagem até a próxima). Isolado, ele assina o
 * relógio sozinho — e o `<Player>` ao lado deixa de re-renderizar 30x/s.
 */
function CabecalhoDoTempo({
  relogio,
  cenas,
  offsetSeg,
  layoutYoutube,
}: {
  relogio: RelogioDoPlayer;
  cenas: CenaRemotion[];
  offsetSeg: number;
  layoutYoutube?: YoutubeLayout;
}) {
  const currentTime = useTempoDoPlayer(relogio);
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

  return (
    <>
      <span className="num text-fg-3">t={segParaMmSs(currentTime, true)}</span>
      {cenaAtiva ? (
        <span className="text-pequeno font-semibold text-ok">cena: {cenaAtivaLabel}</span>
      ) : proximaCena ? (
        <span
          className="text-pequeno text-fg-2"
          title={`Próxima: ${proximaLabel} em ${segParaMmSs(proximaCena.inicio, true)}`}
        >
          próx: {proximaLabel} em {segundosParaProxima!.toFixed(1)}s
        </span>
      ) : (
        <span className="text-pequeno text-aviso">
          sem cenas {cenas.length === 0 ? '(0 carregadas)' : ''}
        </span>
      )}
      <span className="text-pequeno text-fg-2">{layoutAtivo === 'compartilhada' ? 'compartilhada' : 'full'}</span>
    </>
  );
}
