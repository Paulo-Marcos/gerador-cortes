import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  arrastar,
  diferenca,
  foraDaFaixaRecomendada,
  posicaoPct,
  segundoNoPonteiro,
  type Borda,
  type Bordas,
  mmss,
} from './linhaDoTempoShort';
import type { ShortSugerido } from './shortsApi';

// D-478: o bruto inteiro numa faixa, com o candidato em foco recortável no
// arraste.
//
// Não reusa o `TimelinePanel` do editor de propósito: aquele tem 1480 linhas,
// carrega WaveSurfer, desenha desvios e regiões, e está travado por duas
// features (f024, f061). Trazer tudo isso para cá seria pagar um preço alto
// por um décimo do que ele faz — e mexer num arquivo travado por causa de
// outra tela.
//
// O que esta faixa precisa responder, e o `TimelinePanel` não responderia
// melhor: onde os candidatos caem na live, quanto sobra entre eles, e onde
// exatamente começam e terminam.

interface Props {
  /** Duração do bruto — a régua inteira. */
  duracaoSeg: number;
  /** Todos os candidatos, para o operador ver a distribuição. */
  shorts: ShortSugerido[];
  /** O que está sendo curado agora; só ele tem alças. */
  emFoco: ShortSugerido | undefined;
  /** Onde o player está, para o cursor acompanhar. */
  tempoAtual: number;
  onSeek: (segundos: number) => void;
  onBordas: (shortId: string, bordas: Partial<Bordas>) => void;
}


export function LinhaDoTempo({
  duracaoSeg,
  shorts,
  emFoco,
  tempoAtual,
  onSeek,
  onBordas,
}: Props) {
  const faixa = useRef<HTMLDivElement>(null);
  // Enquanto arrasta, a faixa desenha ESTE valor em vez do que veio do
  // servidor: sem isso a alça só se moveria depois do PATCH, e o arraste
  // pareceria travado.
  const [arrastando, setArrastando] = useState<{ borda: Borda; bordas: Bordas } | null>(null);

  const segundoDoEvento = useCallback(
    (clientX: number) => {
      const rect = faixa.current?.getBoundingClientRect();
      if (!rect) return 0;
      return segundoNoPonteiro(clientX, rect, duracaoSeg);
    },
    [duracaoSeg],
  );

  const pegarAlca = (borda: Borda) => (evento: ReactPointerEvent<HTMLButtonElement>) => {
    if (!emFoco) return;
    evento.preventDefault();
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    setArrastando({ borda, bordas: { inicio: emFoco.inicio_seg, fim: emFoco.fim_seg } });
  };

  const moverAlca = (evento: ReactPointerEvent<HTMLButtonElement>) => {
    if (!arrastando) return;
    const bordas = arrastar(
      arrastando.bordas,
      arrastando.borda,
      segundoDoEvento(evento.clientX),
      duracaoSeg,
    );
    setArrastando({ ...arrastando, bordas });
  };

  // O PATCH sai UMA vez, aqui — não a cada movimento. Sessenta escritas por
  // segundo entupiriam a fila e ainda deixariam a última chegar fora de ordem.
  const soltarAlca = (evento: ReactPointerEvent<HTMLButtonElement>) => {
    if (!arrastando || !emFoco) return;
    evento.currentTarget.releasePointerCapture(evento.pointerId);
    const mudou = diferenca({ inicio: emFoco.inicio_seg, fim: emFoco.fim_seg }, arrastando.bordas);
    if (mudou) onBordas(emFoco.id, mudou);
    // Leva o player para a borda que acabou de mudar: o operador quer conferir
    // o que fez, e ir até lá sozinho seria trabalho que a tela já sabe fazer.
    onSeek(arrastando.borda === 'inicio' ? arrastando.bordas.inicio : arrastando.bordas.fim);
    setArrastando(null);
  };

  const bordasVisiveis: Bordas | null = arrastando
    ? arrastando.bordas
    : emFoco
      ? { inicio: emFoco.inicio_seg, fim: emFoco.fim_seg }
      : null;

  const duracaoEmFoco = bordasVisiveis ? bordasVisiveis.fim - bordasVisiveis.inicio : 0;
  const alerta = bordasVisiveis !== null && foraDaFaixaRecomendada(duracaoEmFoco);

  return (
    <div className="flex-none select-none">
      <div className="mb-1 flex items-center gap-2 font-code text-[10.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span>00:00</span>
        <div className="flex-1" />
        {bordasVisiveis && (
          <span className={cn(alerta && 'font-bold text-[var(--wb-warn-ink)]')}>
            {mmss(bordasVisiveis.inicio)} → {mmss(bordasVisiveis.fim)} ·{' '}
            {Math.round(duracaoEmFoco)}s
            {alerta && ' · fora de 15-90s'}
          </span>
        )}
        <div className="flex-1" />
        <span>{mmss(duracaoSeg)}</span>
      </div>

      {/* Clicar na régua navega o player: é a ação mais frequente aqui, e
          exigir que ela passe por um botão seria esconder o óbvio. */}
      <div
        ref={faixa}
        role="presentation"
        onPointerDown={(e) => onSeek(segundoDoEvento(e.clientX))}
        className="relative h-11 w-full cursor-pointer rounded-[8px] bg-[var(--wb-bg-inset)]"
      >
        {/* Os outros candidatos, apagados: mostram a distribuição sem competir
            com quem está sendo curado. */}
        {shorts.map((short) => {
          if (short.id === emFoco?.id) return null;
          const esquerda = posicaoPct(short.inicio_seg, duracaoSeg);
          return (
            <div
              key={short.id}
              title={`${short.titulo} · ${mmss(short.inicio_seg)}`}
              className={cn(
                'absolute inset-y-2 rounded-[3px] bg-[var(--wb-border)]',
                short.status === 'rejeitado' && 'opacity-40',
              )}
              style={{
                left: `${esquerda}%`,
                width: `${Math.max(0.4, posicaoPct(short.fim_seg, duracaoSeg) - esquerda)}%`,
              }}
            />
          );
        })}

        {bordasVisiveis && (
          <div
            className={cn(
              'absolute inset-y-0 rounded-[5px] border-2 bg-[var(--wb-accent)]/25',
              alerta ? 'border-[var(--wb-warn-ink)]' : 'border-[var(--wb-accent)]',
            )}
            style={{
              left: `${posicaoPct(bordasVisiveis.inicio, duracaoSeg)}%`,
              width: `${Math.max(
                0.6,
                posicaoPct(bordasVisiveis.fim, duracaoSeg) -
                  posicaoPct(bordasVisiveis.inicio, duracaoSeg),
              )}%`,
            }}
          />
        )}

        {bordasVisiveis && emFoco && (
          <>
            <Alca
              rotulo="Arrastar o inicio do short"
              pct={posicaoPct(bordasVisiveis.inicio, duracaoSeg)}
              ativa={arrastando?.borda === 'inicio'}
              onPointerDown={pegarAlca('inicio')}
              onPointerMove={moverAlca}
              onPointerUp={soltarAlca}
            />
            <Alca
              rotulo="Arrastar o fim do short"
              pct={posicaoPct(bordasVisiveis.fim, duracaoSeg)}
              ativa={arrastando?.borda === 'fim'}
              onPointerDown={pegarAlca('fim')}
              onPointerMove={moverAlca}
              onPointerUp={soltarAlca}
            />
          </>
        )}

        {/* O cursor do player, por cima de tudo — é a única coisa que se move
            sozinha, e precisa ser lida sobre qualquer fundo. */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-white mix-blend-difference"
          style={{ left: `${posicaoPct(tempoAtual, duracaoSeg)}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

/** Alça de borda: alvo largo, traço fino. O dedo precisa do primeiro, o olho do segundo. */
function Alca({
  rotulo,
  pct,
  ativa,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  rotulo: string;
  pct: number;
  ativa: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize touch-none bg-transparent"
      style={{ left: `${pct}%` }}
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full transition-colors',
          ativa ? 'bg-white' : 'bg-[var(--wb-accent)]',
        )}
      />
    </button>
  );
}
