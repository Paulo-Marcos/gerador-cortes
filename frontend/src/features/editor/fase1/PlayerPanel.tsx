import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { GripVertical, Scissors } from 'lucide-react';
import { hmsParaSeg, segParaMmSs } from '../timeUtils';
import { useVideoPlayer, type PlayerHandle } from '@/hooks/useVideoPlayer';
import { useLipSyncPreview } from '@/hooks/useLipSyncPreview';
import { AudioSyncControl } from './AudioSyncControl';
import type { Desvio } from '@/types/models';

export type { PlayerHandle };

// ─────────────────────────────────────────────────────────────
// PlayerPanel — replica `design_reference/src/v2_bruto.jsx:627-649`.
// Panel header "Player" + badge "video original · 4K" + display
// "<rate>× · <timecode>" a direita. Conteudo: <video> 16:9 centralizado.
//
// O antigo painel inferior (prev/next aprovados) saiu para o
// BrutoContextStrip — substituido pelo bloco IN/OUT/DUR.
// ─────────────────────────────────────────────────────────────

interface Props {
  src: string;
  inicioSeg: number;
  fimSeg: number;
  desvios?: Desvio[];
  /** Velocidade atual do player (1.25 etc). Exibida no header. */
  playbackRate?: number;
  smartPlay?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  // F-063: sincronia fina de áudio (lip-sync).
  /** Proxy de áudio do corte; habilita o preview ao vivo do offset. */
  audioPreviewSrc?: string;
  /** Tempo de vídeo (s) correspondente ao início do proxy de áudio. */
  audioPreviewStartSec?: number;
  /** Offset atual (ms). Quando `onAudioOffsetChange` é dado, mostra o controle. */
  audioOffsetMs?: number;
  onAudioOffsetChange?: (ms: number) => void;
}

export const PlayerPanel = forwardRef<PlayerHandle, Props>(function PlayerPanel(
  {
    src,
    inicioSeg,
    fimSeg,
    desvios,
    playbackRate = 1,
    smartPlay,
    onTimeUpdate,
    audioPreviewSrc,
    audioPreviewStartSec = 0,
    audioOffsetMs = 0,
    onAudioOffsetChange,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const controls = useVideoPlayer(videoRef);
  useImperativeHandle(ref, () => controls, [controls]);
  const lastTimeRef = useRef(0);
  const currentTimeRef = useRef(inicioSeg);

  // D-228: mantém a última `onTimeUpdate` num ref para não recriar o listener de
  // `timeupdate` quando o pai passa um callback novo a cada render — antes, isso
  // desanexava/reanexava o listener a cada troca de corte.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  const [previewSync, setPreviewSync] = useState(false);
  const podePreview = !!audioPreviewSrc;
  useLipSyncPreview(videoRef, audioRef, {
    enabled: previewSync && podePreview,
    proxyStartSec: audioPreviewStartSec,
    offsetMs: audioOffsetMs,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const t = video.currentTime;
      const prev = lastTimeRef.current;
      lastTimeRef.current = t;
      currentTimeRef.current = t;
      onTimeUpdateRef.current?.(t);

      if (fimSeg > 0 && !video.paused && prev < fimSeg && t >= fimSeg && t - prev < 1) {
        video.pause();
        return;
      }

      if (smartPlay && desvios?.length && !video.paused) {
        for (const d of desvios) {
          const ds = hmsParaSeg(d.inicio_hms);
          const de = hmsParaSeg(d.fim_hms);
          if (video.currentTime >= ds && video.currentTime < de) {
            video.currentTime = de;
            break;
          }
        }
      }
    };
    const onLoaded = () => {
      video.currentTime = inicioSeg;
      lastTimeRef.current = inicioSeg;
      currentTimeRef.current = inicioSeg;
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onLoaded);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [src, inicioSeg, fimSeg, desvios, smartPlay]);

  const duracao = Math.max(0, fimSeg - inicioSeg);
  const rateLabel = `${playbackRate.toFixed(2)}×`;

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      {/* Header: grip + caption + badge + right info ---- v2_bruto.jsx:629-637 */}
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <GripVertical size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Player
        </span>
        <span className="rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
          video original · 4K
        </span>
        <div className="flex-1" />
        {smartPlay && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 font-code text-[10px] font-bold text-[var(--wb-accent)]">
            <Scissors size={10} aria-hidden />
            sem cortes
          </span>
        )}
        <span
          className="font-code text-[11px] text-[var(--wb-text-dim)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {rateLabel} · corte de {segParaMmSs(duracao, true)}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          crossOrigin="anonymous"
          className="h-full w-full"
        />
      </div>

      {/* F-063: áudio do proxy para preview de lip-sync (oculto, controlado pelo hook). */}
      {podePreview && (
        <audio
          ref={audioRef}
          src={audioPreviewSrc}
          preload="auto"
          crossOrigin="anonymous"
          className="hidden"
        />
      )}
      {onAudioOffsetChange && (
        <AudioSyncControl
          offsetMs={audioOffsetMs}
          onChange={onAudioOffsetChange}
          previewEnabled={previewSync}
          onTogglePreview={() => setPreviewSync((v) => !v)}
          canPreview={podePreview}
        />
      )}
    </section>
  );
});
