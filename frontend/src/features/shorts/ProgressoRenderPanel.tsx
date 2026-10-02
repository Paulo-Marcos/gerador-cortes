import { useState } from 'react';
import { cn } from '@/lib/utils';
import { foiCancelado } from './estadoDoCandidato';
import { useLogDoRender } from './useShortsDoCorte';
import type { PassoRender, ProgressoRender } from './shortsApi';
import { Icon } from '@/upgrade/Icon';

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
  /** D-568: de quem é este render — o log é lido por short. */
  shortId: string;
}

const ICONE: Record<PassoRender['status'], React.ReactNode> = {
  pendente: <Icon name="circle-dashed" className="text-[var(--wb-text-mute)]" />,
  rodando: <Icon name="loader-2" className="animate-spin text-[var(--wb-accent)]" />,
  concluido: <Icon name="check" className="text-[var(--wb-ok-ink)]" />,
  erro: <Icon name="x" className="text-[var(--wb-warn-ink)]" />,
};

function decorrido(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}min ${total % 60}s`;
}

export function ProgressoRenderPanel({ progresso, shortId }: Props) {
  const { estagio, concluido, erro, fila, decorrido_seg: decorridoSeg, passos } = progresso;
  const cancelado = foiCancelado(progresso);

  // Terminou sem erro: o card já mostra o player, e um painel de "tudo pronto"
  // ao lado dele seria ruído sobre um fato que a tela já conta melhor.
  if (concluido && !erro && !cancelado) return null;

  return (
    <div
      className="mt-2.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-2.5"
      aria-live="polite"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-wide text-[var(--wb-text-dim)]">
          {erro
            ? `${estagio} falhou`
            : cancelado
              ? `render ${estagio} cancelado`
              : fila
                ? `${estagio} na fila`
                : `renderizando ${estagio}`}
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

      {cancelado && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
          Cancelado pela fila. O arquivo anterior, se havia, continua valendo — renderize de novo
          quando quiser.
        </p>
      )}

      {!erro && !cancelado && (
        // A camada é o passo longo, e sem dizer isso o operador acha que travou
        // justamente onde é normal demorar. D-843: na fila, o motivo da espera
        // (vaga ou RAM) responde o mesmo "travou?" antes de qualquer passo.
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
          {fila
            ? `${fila}. Cortes e shorts dividem as mesmas vagas de render — este começa sozinho quando abrir a dele.`
            : 'Desenhar a legenda e as cenas é o passo demorado — costuma levar alguns minutos.'}{' '}
          Pode sair desta tela: o render continua.
        </p>
      )}

      <LogDoWorker shortId={shortId} emCurso={!concluido} />
    </div>
  );
}

/**
 * D-568: o log do worker, atrás de um clique.
 *
 * Aberto por padrão ele empurraria os passos para fora da vista em cinco cards
 * ao mesmo tempo — e na maioria das vezes basta saber QUAL etapa corre. O log é
 * para quando isso não basta: "fico no escuro".
 */
function LogDoWorker({ shortId, emCurso }: { shortId: string; emCurso: boolean }) {
  const [verLog, setVerLog] = useState(false);
  const log = useLogDoRender(shortId, verLog && emCurso);
  const linhas = log.data?.linhas ?? [];

  return (
    <>
      {/* D-568: o mesmo `worker_debug.log` que o horizontal deixa acompanhar.
          Uma entrada por passo: o comando que rodou e, ao fechar, a duração. */}
      <button
        type="button"
        onClick={() => setVerLog((v) => !v)}
        className="mt-2 flex items-center gap-1 font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
      >
        {verLog ? <Icon name="chevron-down" /> : <Icon name="chevron-right" />}
        log do worker
      </button>

      {verLog && (
        <div className="mt-1 max-h-[180px] overflow-auto rounded-[6px] bg-[var(--wb-bg)] p-1.5">
          {linhas.length === 0 ? (
            <p className="font-code text-[10.5px] text-[var(--wb-text-mute)]">
              {log.data?.existe === false
                ? 'Nenhum passo despachado ainda — o log nasce quando o worker pega o primeiro.'
                : 'lendo…'}
            </p>
          ) : (
            <pre className="whitespace-pre-wrap break-all font-code text-[10px] leading-relaxed text-[var(--wb-text-dim)]">
              {linhas.join('\n')}
            </pre>
          )}
        </div>
      )}
    </>
  );
}
