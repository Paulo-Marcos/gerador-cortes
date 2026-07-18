import { useEffect, useRef } from 'react';
import { Quote, X } from 'lucide-react';

/**
 * Painel de embasamento de uma live no ranking (D-356).
 *
 * Mostra POR QUE a live tirou aquela nota: para cada critério, o valor bruto que o
 * dono reconhece → o normalizado (posição no lote) → o peso → a contribuição em
 * pontos; a nota final é a soma das contribuições; e as frases que o Claude extraiu
 * justificando a positividade dos comentários.
 *
 * Os tipos vêm LOCALMENTE aqui (o payload traz `embasamento` on-the-fly; `api.ts`
 * está travado e não descreve o campo — D-356).
 */
export interface EmbasamentoItem {
  criterio: string;
  rotulo: string;
  valor_bruto: number;
  valor_normalizado: number;
  peso: number;
  contribuicao: number;
}

interface PanelProps {
  titulo: string;
  pontuacaoTotal: number;
  embasamento: EmbasamentoItem[];
  destaques: string[];
  onClose: () => void;
}

function formatBruto(criterio: string, valor: number): string {
  switch (criterio) {
    case 'views':
      return `${Math.round(valor).toLocaleString('pt-BR')} views`;
    case 'likes_por_view':
      return `${(valor * 100).toFixed(2)}% das views`;
    case 'comentarios_por_view':
      return `${(valor * 100).toFixed(3)}% das views`;
    case 'sentimento':
      return `${valor.toFixed(1)} / 10`;
    case 'recencia':
      return `${Math.round(valor)} dias atrás`;
    case 'vph':
      return `${Math.round(valor).toLocaleString('pt-BR')} views/h`;
    default:
      return String(valor);
  }
}

export function RankingEmbasamentoPanel({
  titulo,
  pontuacaoTotal,
  embasamento,
  destaques,
  onClose,
}: PanelProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => painelRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  const somaContribuicoes = embasamento.reduce((acc, item) => acc + item.contribuicao, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Embasamento da nota — ${titulo}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={painelRef}
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text)] shadow-[var(--wb-shadow)] outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--wb-border-soft)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <span className="font-code text-[10px] uppercase tracking-widest text-[var(--wb-text-dim)]">
              Por que essa nota?
            </span>
            <h2 className="mt-1 line-clamp-2 text-base font-bold leading-tight text-[var(--wb-text)]">
              {titulo}
            </h2>
          </div>
          <span className="flex flex-col items-end">
            <span className="font-editorial text-3xl leading-none text-[var(--wb-text)]">
              {Math.round(pontuacaoTotal)}
            </span>
            <span className="font-code text-[10px] uppercase tracking-widest text-[var(--wb-text-dim)]">
              nota
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--wb-text-dim)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-[var(--wb-text-mute)]">
            Cada critério vale o valor bruto → sua posição no lote (0–100%) × o peso do canal = a
            contribuição em pontos. A soma das contribuições é a nota final.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--wb-border-soft)] text-left font-code text-[10px] uppercase tracking-wider text-[var(--wb-text-dim)]">
                  <th className="py-2 pr-3 font-normal">Critério</th>
                  <th className="py-2 pr-3 font-normal">Bruto</th>
                  <th className="py-2 pr-3 text-right font-normal">No lote</th>
                  <th className="py-2 pr-3 text-right font-normal">Peso</th>
                  <th className="py-2 text-right font-normal">Contrib.</th>
                </tr>
              </thead>
              <tbody>
                {embasamento.map((item) => (
                  <tr
                    key={item.criterio}
                    className="border-b border-[var(--wb-border-soft)] last:border-0"
                  >
                    <td className="py-2 pr-3 font-semibold text-[var(--wb-text)]">{item.rotulo}</td>
                    <td className="py-2 pr-3 text-[var(--wb-text-mute)]">
                      {formatBruto(item.criterio, item.valor_bruto)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--wb-text-mute)]">
                      {Math.round(item.valor_normalizado * 100)}%
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--wb-text-mute)]">
                      {item.peso.toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums text-[var(--wb-text)]">
                      {item.contribuicao.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--wb-border)]">
                  <td
                    className="py-2 pr-3 font-code text-[11px] uppercase tracking-wider text-[var(--wb-text-dim)]"
                    colSpan={4}
                  >
                    Nota final (soma)
                  </td>
                  <td className="py-2 text-right font-editorial text-lg tabular-nums text-[var(--wb-text)]">
                    {somaContribuicoes.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {destaques.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2 flex items-center gap-1.5 font-code text-[10px] uppercase tracking-widest text-[var(--wb-text-dim)]">
                <Quote size={12} aria-hidden />
                Comentários que justificam o tom
              </h3>
              <ul className="grid gap-2">
                {destaques.map((destaque, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-[var(--wb-accent-soft)] bg-[var(--wb-bg-inset)] px-3 py-2 text-[13px] italic text-[var(--wb-text-mute)]"
                  >
                    &ldquo;{destaque}&rdquo;
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
