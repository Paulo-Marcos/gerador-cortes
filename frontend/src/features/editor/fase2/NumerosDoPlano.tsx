import { FOCO } from '@/features/editor/salaDoEditor';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';
import { LegendaDaOrigem } from './CenaComOrigem';

// ─────────────────────────────────────────────────────────────────────────────
// A linha dos números do plano (AUDITORIA-v4 §2: eram 3 cards, viraram uma linha) e,
// na ponta dela, a legenda das origens.
//
// D-1086: a legenda das 4 origens ocupava duas linhas fixas no cabeçalho. Ela é
// consulta: cada cena da lista já traz o selo da própria origem ("da IA · conferida").
// Fica atrás de "Legenda", num `<details>` nativo que abre por cima da lista, sem
// empurrá-la; o teclado e o leitor de tela o abrem sem estado no React.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  duracao: number;
  cenas: number;
  riscadas: number;
  cobertura: number;
  /** Sem cenas, não há origem para explicar. */
  temCenas: boolean;
}

const Separador = () => (
  <span aria-hidden className="text-fio-2">
    ·
  </span>
);

export function NumerosDoPlano({ duracao, cenas, riscadas, cobertura, temCenas }: Props) {
  return (
    <div className="num flex flex-wrap items-center gap-2 text-micro" data-testid="numeros-do-plano">
      <span>
        <b className="font-bold text-fg">{duracao.toFixed(0)}s</b>{' '}
        <span className="text-fg-3">duração</span>
      </span>
      <Separador />
      <span>
        <b className="font-bold text-fg">{cenas}</b> <span className="text-fg-3">cenas</span>
        {riscadas > 0 && <span className="text-fg-3"> · {riscadas} riscada(s) fora</span>}
      </span>
      <Separador />
      <span>
        <b className="font-bold text-fg">{cobertura.toFixed(0)}%</b>{' '}
        <span className="text-fg-3">cobertura</span>
      </span>
      {temCenas && <LegendaRecolhida />}
    </div>
  );
}

export function LegendaRecolhida() {
  return (
    <details className="group relative ml-auto font-sans" data-testid="legenda-do-plano">
      <summary
        data-sala=""
        className={cn('inline-flex cursor-pointer list-none items-center gap-1 rounded-etiqueta px-1 text-micro text-fg-2 transition-colors hover:text-fg motion-reduce:transition-none [&::-webkit-details-marker]:hidden', FOCO)}
      >
        Legenda
        <Icon name="chevron-down" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <LegendaDaOrigem className="absolute right-0 top-full z-20 mt-1 w-[240px] flex-col rounded-campo border border-fio bg-painel-solido p-2 shadow-pop" />
    </details>
  );
}
