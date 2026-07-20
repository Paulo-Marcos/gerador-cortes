import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hmsParaSeg, segParaHms, segParaMmSs } from '../timeUtils';
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
//
// `variant="overlay"` (AUDITORIA-v2 §4, CP4) — usado só pelo shell Workbench:
// sem o header de texto acima do vídeo; os mesmos dados (BRUTO/velocidade/
// intervalo do corte) viram 3 chips sobrepostos DIRETO no vídeo. O shell
// legado (EditorFase1) continua no `variant="legacy"` (default) — inalterado.
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
  /** AUDITORIA-v2 §4 (CP4) — 'legacy' (default) mantém o header do editor
   *  antigo; 'overlay' é o vídeo largo do Workbench com chips sobrepostos. */
  variant?: 'legacy' | 'overlay';
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
    variant = 'legacy',
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
    <section
      className={cn(
        'flex h-full w-full flex-col overflow-hidden',
        variant === 'overlay'
          ? 'rounded-xl shadow-[shadow:var(--wb-shadow)]'
          : 'rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]',
      )}
    >
      {/* Header: grip + caption + badge + right info ---- v2_bruto.jsx:629-637
          Só no legado — o Workbench (variant="overlay") sobrepõe os mesmos
          dados como chips direto no vídeo (AUDITORIA-v2 §4). */}
      {variant === 'legacy' && (
        <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
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
      )}

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          crossOrigin="anonymous"
          className="h-full w-full"
        />
        {variant === 'overlay' && (
          <>
            <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-[5px] bg-black/50 px-1.5 py-0.5 font-code text-[9px] font-bold text-white">
              BRUTO
            </span>
            <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-[5px] bg-black/50 px-1.5 py-0.5 font-code text-[9px] font-bold text-white">
              {rateLabel}
            </span>
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-[5px] bg-black/55 px-2 py-0.5 font-code text-[10px] font-semibold text-white">
              {segParaHms(inicioSeg)} / {segParaHms(fimSeg)}
            </span>
          </>
        )}
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
      {/* AUDITORIA-v2 §5 (CP5): no Workbench (variant='overlay') a faixa de
          sincronia sai daqui — vira irmã do vídeo (fora do cap de altura do
          PlayerCap), montada pelo próprio EditorPage com variant="workbench".
          O legado (variant='legacy') mantém o controle aqui, inalterado. */}
      {variant === 'legacy' && onAudioOffsetChange && (
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
