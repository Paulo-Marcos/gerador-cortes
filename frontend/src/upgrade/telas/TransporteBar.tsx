import { useEffect, useState, type RefObject } from 'react';
import type { PlayerHandle } from '@/hooks/useVideoPlayer';
import { segParaMmSs } from '@/features/editor/timeUtils';
import { Icon } from '../Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · A barra de transporte da Bancada.
//
// O protótipo separa em dois cartões o que hoje divide uma linha só:
// aqui fica COMO ASSISTIR (tocar, ir aos extremos, velocidade, fonte) e
// no cartão de baixo fica COMO EDITAR (In/Out, travar, zoom, trecho).
//
// A separação não é arrumação. São dois modos de mão: assistir é
// contínuo e roda o tempo todo; editar é pontual e acontece quando o
// vídeo está parado. Misturá-los fazia o play e o "marcar In" dividirem
// a mesma vizinhança, e errar o alvo custa um corte.
//
// O tempo é RELATIVO ao início do corte — a mesma convenção do resto da
// bancada. O tempo absoluto da live não ajuda a decidir nada aqui.
// ─────────────────────────────────────────────────────────────────

export type FonteDoPalco = { texto: string; ativa: boolean; onClick?: () => void };

type TransporteBarProps = {
  playerRef: RefObject<PlayerHandle>;
  inicioSeg: number;
  fimSeg: number;
  currentTime: number;
  playbackRate: number;
  onChangeSpeed?: (delta: number) => void;
  /** Quantos trechos vão sair — o chip que o protótipo põe ao lado do tempo. */
  trechos?: number;
  fontes?: FonteDoPalco[];
};

export function TransporteBar({
  playerRef,
  inicioSeg,
  fimSeg,
  currentTime,
  playbackRate,
  onChangeSpeed,
  trechos,
  fontes = [],
}: TransporteBarProps) {
  // O ícone precisa saber se está tocando, e `isPlaying()` é imperativo.
  // Um sondar curto custa menos que reescrever o player para emitir estado.
  const [tocando, setTocando] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setTocando(playerRef.current?.isPlaying() ?? false);
    }, 250);
    return () => window.clearInterval(id);
  }, [playerRef]);

  const relativo = Math.max(0, currentTime - inicioSeg);
  const total = Math.max(0, fimSeg - inicioSeg);

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 7,
        padding: '5px 9px',
        minHeight: 40,
        flex: 'none',
      }}
    >
      <button
        type="button"
        className="btn btn-icon"
        title={tocando ? 'Pausar (Space)' : 'Tocar (Space)'}
        aria-label={tocando ? 'Pausar' : 'Tocar'}
        onClick={() => playerRef.current?.togglePlay()}
        style={{ borderColor: 'transparent', background: 'var(--ink)', color: 'var(--bg)' }}
      >
        <Icon name={tocando ? 'pause' : 'play'} size={13} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        title="Voltar ao início do corte"
        aria-label="Voltar ao início do corte"
        onClick={() => playerRef.current?.seekTo(inicioSeg)}
      >
        <Icon name="chevron-first" size={14} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        title="Ir ao fim do corte"
        aria-label="Ir ao fim do corte"
        onClick={() => playerRef.current?.seekTo(fimSeg)}
      >
        <Icon name="chevron-last" size={14} />
      </button>

      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
        {segParaMmSs(relativo, true)}
        <span style={{ color: 'var(--dim)' }}> / {segParaMmSs(total, true)}</span>
      </span>

      {typeof trechos === 'number' ? (
        <span
          className="chip"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent2)',
            fontFamily: 'var(--mono)',
          }}
        >
          {trechos} {trechos === 1 ? 'trecho' : 'trechos'}
        </span>
      ) : null}

      <div style={{ flex: 1 }} />

      {fontes.map((f) => (
        <button
          key={f.texto}
          type="button"
          onClick={f.onClick}
          disabled={!f.onClick}
          style={{
            height: 26,
            padding: '0 9px',
            border: `1px solid ${f.ativa ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 'var(--r2)',
            background: f.ativa ? 'var(--accent-soft)' : 'var(--inset)',
            color: f.ativa ? 'var(--accent2)' : 'var(--mute)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: f.onClick ? 'pointer' : 'default',
          }}
        >
          {f.texto}
        </button>
      ))}

      {/* A velocidade é indicador E controle: clicar percorre a escala, que é
          o gesto que o editor faz dezenas de vezes por corte. */}
      <button
        type="button"
        className="fld"
        onClick={() => onChangeSpeed?.(0.25)}
        onContextMenu={(e) => {
          e.preventDefault();
          onChangeSpeed?.(-0.25);
        }}
        disabled={!onChangeSpeed}
        title="Clique acelera, clique direito desacelera"
        style={{ height: 26, fontFamily: 'var(--mono)', cursor: onChangeSpeed ? 'pointer' : 'default' }}
      >
        <Icon name="gauge" size={12} />
        {playbackRate.toFixed(2)}×
      </button>
    </div>
  );
}
