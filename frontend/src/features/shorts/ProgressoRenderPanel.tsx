import { Check, CircleDashed, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PassoRender, ProgressoRender } from './shortsApi';

// D-485: o que estava faltando durante cinco minutos e meio de silêncio.
//
// O render do short reusou o worker, a fila e o gate de RAM do pipeline
// horizontal — e não reusou o painel de passos que torna tudo isso legível. O
// operador clicava e olhava um botão apagado, sem meio de distinguir "rodando"
// de "morto".
//
// O tempo decorrido está aqui, e não só a lista de passos, por um motivo
// concreto: no bruto cada etapa dura segundos, e saber QUAL roda basta. Aqui a
// camada do Remotion sozinha leva minutos — a pergunta de quem desconfia não é
// "qual passo?", é "há quanto tempo?".

interface Props {
  progresso: ProgressoRender;
}

const ICONE: Record<PassoRender['status'], React.ReactNode> = {
  pendente: <CircleDashed size={11} className="text-[var(--wb-text-mute)]" aria-hidden />,
  rodando: <Loader2 size={11} className="animate-spin text-[var(--wb-accent)]" aria-hidden />,
  concluido: <Check size={11} className="text-[var(--wb-ok-ink)]" aria-hidden />,
  erro: <X size={11} className="text-[var(--wb-warn-ink)]" aria-hidden />,
};

function decorrido(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}min ${total % 60}s`;
}

export function ProgressoRenderPanel({ progresso }: Props) {
  const { estagio, concluido, erro, decorrido_seg: decorridoSeg, passos } = progresso;

  // Terminou sem erro: o card já mostra o player, e um painel de "tudo pronto"
  // ao lado dele seria ruído sobre um fato que a tela já conta melhor.
  if (concluido && !erro) return null;

  return (
    <div
      className="mt-2.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-2.5"
      aria-live="polite"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-wide text-[var(--wb-text-dim)]">
          {erro ? `${estagio} falhou` : `renderizando ${estagio}`}
        </span>
        <div className="flex-1" />
        <span className="font-code text-[10.5px] tabular-nums text-[var(--wb-text-mute)]">
          {decorrido(decorridoSeg)}
        </span>
      </div>

      <ol className="space-y-1">
        {passos.map((passo) => (
          <li key={passo.chave} className="flex items-center gap-1.5 text-[11.5px]">
            {ICONE[passo.status]}
            <span
              className={cn(
                passo.status === 'rodando' && 'font-semibold text-[var(--wb-text)]',
                passo.status === 'concluido' && 'text-[var(--wb-text-dim)]',
                passo.status === 'pendente' && 'text-[var(--wb-text-mute)]',
                passo.status === 'erro' && 'font-semibold text-[var(--wb-warn-ink)]',
              )}
            >
              {passo.label}
            </span>
          </li>
        ))}
      </ol>

      {erro && (
        <p className="mt-2 border-t border-[var(--wb-border-soft)] pt-2 text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
          {erro}
        </p>
      )}

      {!erro && (
        // A camada é o passo longo, e sem dizer isso o operador acha que travou
        // justamente onde é normal demorar.
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
          Desenhar a legenda e as cenas é o passo demorado — costuma levar alguns minutos.
          Pode sair desta tela: o render continua.
        </p>
      )}
    </div>
  );
}
