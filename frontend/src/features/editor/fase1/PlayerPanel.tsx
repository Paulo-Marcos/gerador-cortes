import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Scissors, Volume2 } from 'lucide-react';
import { hmsParaSeg } from '../timeUtils';
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
// D-599: o palco do upgrade de layout — o vídeo vira um retângulo preto
// centralizado, com proporção fixa, cantos de 5 px e um selo em mono no
// canto. Sem moldura de painel em volta: no design o palco É o painel, e a
// imagem manda no enquadramento. As variantes do legado e do Workbench
// saíram com as cascas (D-728).
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
  /** Proporção do palco ('16/9' no bruto, '9/16' no short). */
  proporcao?: string;
  /** Selo do canto superior esquerdo: "BRUTO · 1080p", "FINAL · grade". */
  selo?: string;
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
    proporcao = '16/9',
    selo,
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
  // D-610 (casca nova): a sincronia se ajusta uma vez por vídeo, não por
  // corte. Fica recolhida num botão e só vira faixa quando pedida.
  const [sincroniaAberta, setSincroniaAberta] = useState(false);
  const podePreview = !!audioPreviewSrc;
  const estadoPreview = useLipSyncPreview(videoRef, audioRef, {
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

  // ── D-599: o palco ────────────────────────────────────────────
  // O design tira a moldura e centraliza um retângulo de proporção
  // fixa. `container-type: inline-size` é o detalhe que faz a peça
  // funcionar: a legenda passa a medir em `cqw`, então ela cresce e
  // encolhe JUNTO com o palco. Legenda em px num palco elástico é
  // legenda que mente sobre como o texto vai sair no vídeo final.
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          minHeight: 220,
          minWidth: 0,
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '100%',
            maxWidth: '100%',
            aspectRatio: proporcao,
            borderRadius: 'var(--r3)',
            overflow: 'hidden',
            background: '#000',
            boxShadow: 'var(--shadow)',
            containerType: 'inline-size',
          }}
        >
          <video
            ref={videoRef}
            src={src}
            controls
            preload="metadata"
            crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {selo ? (
            <span
              className="chip"
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'rgb(0 0 0/.55)',
                color: '#fff',
                fontFamily: 'var(--mono)',
                pointerEvents: 'none',
              }}
            >
              {selo}
            </span>
          ) : null}

          {smartPlay ? (
            <span
              className="chip"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'rgb(0 0 0/.55)',
                color: '#fff',
                fontFamily: 'var(--mono)',
                pointerEvents: 'none',
              }}
            >
              <Scissors size={11} aria-hidden />
              sem cortes
            </span>
          ) : null}

          {/* D-511 preservado: o que está sendo dito no trecho marcado para
              SAIR. Ver o que se perde no instante em que se perde é o que
              permite discordar do corte. */}
          {legenda ? (
            <div
              style={{
                position: 'absolute',
                left: '10%',
                right: '10%',
                bottom: '16%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                pointerEvents: 'none',
              }}
            >
              <span
                className="chip"
                style={{
                  background: 'rgb(0 0 0/.75)',
                  color: '#ff9b9b',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
              >
                sai do bruto{legenda.rotulo ? ` · ${legenda.rotulo}` : ''}
              </span>
              <p
                style={{
                  margin: 0,
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: '4.2cqw',
                  lineHeight: 1.15,
                  color: '#fff',
                  // `paint-order: stroke` desenha o contorno ATRÁS das hastes:
                  // sem ele o traço come as letras finas.
                  paintOrder: 'stroke fill',
                  WebkitTextStroke: '0.35cqw rgba(0,0,0,0.85)',
                  textShadow: '0 2px 0 #000',
                }}
              >
                {legenda.texto}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {podePreview ? (
        <audio
          ref={audioRef}
          src={audioPreviewSrc}
          preload="auto"
          crossOrigin="anonymous"
          className="hidden"
        />
      ) : null}

      {onAudioOffsetChange ? (
        sincroniaAberta ? (
          <AudioSyncControl
            offsetMs={audioOffsetMs}
            onChange={onAudioOffsetChange}
            previewEnabled={previewSync}
            onTogglePreview={() => setPreviewSync((v) => !v)}
            previewEstado={estadoPreview}
            canPreview={podePreview}
            // Fechar desliga o fone junto: vídeo mudo com o interruptor fora
            // de vista foi exatamente a armadilha da D-601.
            onClose={() => {
              setSincroniaAberta(false);
              setPreviewSync(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setSincroniaAberta(true)}
            title="Ajustar a sincronia entre áudio e vídeo"
            style={{ alignSelf: 'flex-start', color: 'var(--mute)' }}
          >
            <Volume2 size={12} aria-hidden />
            Sincronia do áudio
            <span style={{ fontFamily: 'var(--mono)', color: audioOffsetMs ? 'var(--accent)' : 'var(--dim)' }}>
              {audioOffsetMs > 0 ? `+${audioOffsetMs}` : audioOffsetMs} ms
            </span>
          </button>
        )
      ) : null}
    </section>
  );
});
