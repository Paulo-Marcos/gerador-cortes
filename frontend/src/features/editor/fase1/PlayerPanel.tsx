import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hmsParaSeg, segParaMmSs } from '../timeUtils';
import { useVideoPlayer, type PlayerHandle } from '@/hooks/useVideoPlayer';
import { useVelocidadeNoVideo } from '@/hooks/useVelocidadePlayerPadrao';
import { useLipSyncPreview } from '@/hooks/useLipSyncPreview';
import { AudioSyncControl } from './AudioSyncControl';
import { legendaEm } from './legendaDoTrecho';
import type { Desvio } from '@/types/models';

export type { PlayerHandle };

// ─── D-409: retomar de onde parou ────────────────────────────────────────
// Sair do corte e voltar (passar por Configuracoes, por exemplo) recomecava
// o video no inicio, porque `loadedmetadata` sempre reposicionava em
// inicioSeg. A posicao fica no localStorage por corte: e conveniencia de
// navegacao, nao dado do dominio — nao vale um round-trip nem uma coluna.
const POSICAO_PREFIXO = 'bruto:posicao:';
/** Margem para considerar que o corte foi assistido ate o fim. */
const MARGEM_FIM_SEG = 1;

function lerPosicaoSalva(chave: string | undefined): number | null {
  if (!chave) return null;
  try {
    const bruto = localStorage.getItem(POSICAO_PREFIXO + chave);
    if (bruto === null) return null;
    const seg = Number(bruto);
    return Number.isFinite(seg) ? seg : null;
  } catch {
    // Modo privado / storage bloqueado: sem retomada, e so isso.
    return null;
  }
}

function gravarPosicaoSalva(chave: string | undefined, seg: number) {
  if (!chave) return;
  try {
    localStorage.setItem(POSICAO_PREFIXO + chave, String(seg));
  } catch {
    // idem: perder a retomada nunca pode quebrar a reproducao.
  }
}

/**
 * Onde o video deve comecar. Cai em `inicioSeg` quando nao ha posicao salva,
 * quando ela ficou FORA do corte (o corte foi reenquadrado no In/Out desde a
 * ultima visita) ou quando o corte ja tinha sido visto ate o fim — nesses
 * casos retomar levaria a um ponto que nao pertence mais ao corte, ou ao
 * ultimo segundo dele.
 */
export function posicaoInicialDoVideo(
  salva: number | null,
  inicioSeg: number,
  fimSeg: number,
): number {
  if (salva === null || salva < inicioSeg) return inicioSeg;
  if (fimSeg > 0 && salva >= fimSeg - MARGEM_FIM_SEG) return inicioSeg;
  return salva;
}

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
  /** D-409: identidade do corte para lembrar onde a reprodução parou. Sem
   *  ela o player continua sempre começando no início do corte. */
  posicaoKey?: string;
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
    posicaoKey,
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

  // D-409: ultimo segundo ja persistido, para nao escrever no localStorage a
  // cada `timeupdate` (o evento dispara ~4x/s).
  const posicaoGravadaRef = useRef(-1);
  // D-511: o segundo corrente EM ESTADO, e não só no ref.
  //
  // O ref existe para não re-renderizar a cada `timeupdate` (~4x/s); a legenda
  // precisa do contrário — ela SÓ existe se a tela redesenhar. Guardar os dois
  // é o preço de mostrar algo que muda com o tempo sem redesenhar o resto.
  const [segundoNaTela, setSegundoNaTela] = useState(inicioSeg);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const t = video.currentTime;
      const prev = lastTimeRef.current;
      lastTimeRef.current = t;
      currentTimeRef.current = t;
      setSegundoNaTela(t);
      onTimeUpdateRef.current?.(t);

      if (Math.abs(t - posicaoGravadaRef.current) >= 1) {
        posicaoGravadaRef.current = t;
        gravarPosicaoSalva(posicaoKey, t);
      }

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
      const alvo = posicaoInicialDoVideo(lerPosicaoSalva(posicaoKey), inicioSeg, fimSeg);
      video.currentTime = alvo;
      lastTimeRef.current = alvo;
      currentTimeRef.current = alvo;
      posicaoGravadaRef.current = alvo;
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onLoaded);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [src, inicioSeg, fimSeg, desvios, smartPlay, posicaoKey]);

  // D-450: a prop `playbackRate` era so rotulo — quem aplicava era o
  // `playerRef` do EditorPage, ainda nulo quando a preferencia chega, e o
  // chip anunciava 1,50x com o video rodando em 1,00x. Agora o estado do
  // D-511: recalculada a cada `timeupdate`. Barato: uma varredura sobre uma
  // lista de trechos que raramente passa de uma dezena.
  const legenda = legendaEm(desvios ?? [], segundoNaTela);

  // React e a fonte unica: o <video> segue a prop.
  useVelocidadeNoVideo(videoRef, playbackRate, src);

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
        {/* D-511: o que está sendo dito no trecho marcado para SAIR.
            Ver o que se perde no instante em que se perde é o que permite
            discordar do corte — antes o texto só existia no card, cortado em
            duas linhas, e conferir exigia abrir a transcrição à parte. */}
        {legenda && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 flex flex-col items-center gap-1 px-6">
            {/* Legenda de verdade: branca, grande, com CONTORNO.
                A primeira versão pintava o texto de vermelho sobre a imagem — e
                vermelho escuro sobre vídeo é o pior caso de contraste que
                existe, porque muda a cada quadro. O contorno resolve o
                problema na raiz: o texto fica legível sobre qualquer fundo,
                claro ou escuro, sem depender de uma caixa opaca tapando o
                quadro que se quer justamente avaliar. */}
            <span
              className="rounded-full bg-black/75 px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.08em] text-[#ff9b9b]"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
            >
              sai do bruto{legenda.rotulo ? ` · ${legenda.rotulo}` : ''}
            </span>
            <p
              className="max-w-[92%] text-center text-[19px] font-bold leading-[1.35] text-white"
              style={{
                // `paint-order: stroke` desenha o contorno ATRÁS das hastes, e
                // não por cima — sem ele o traço come as letras finas.
                paintOrder: 'stroke fill',
                WebkitTextStroke: '4px rgba(0,0,0,0.85)',
                textShadow: '0 2px 6px rgba(0,0,0,0.75)',
              }}
            >
              {legenda.texto}
            </p>
          </div>
        )}
        {/* D-410: os chips BRUTO / velocidade / intervalo eram `absolute`
            sobre a imagem e brigavam com o conteudo do quadro — sobre um fundo
            claro sumiam, sobre um escuro tapavam o rosto. Migraram para a
            faixa dedicada que o EditorPage monta ACIMA do video, fora da area
            de imagem e com espaco para os campos que faltavam (duracao liquida
            e tempo no corte). O `variant='legacy'` mantem o header de texto. */}
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
