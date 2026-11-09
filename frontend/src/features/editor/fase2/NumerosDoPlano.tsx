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
  <span aria-hidden className="text-[var(--wb-border)]">
    ·
  </span>
);

export function NumerosDoPlano({ duracao, cenas, riscadas, cobertura, temCenas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 font-code text-[11px] tabular-nums" data-testid="numeros-do-plano">
      <span>
        <b className="font-bold text-[var(--wb-text)]">{duracao.toFixed(0)}s</b>{' '}
        <span className="text-[var(--wb-text-dim)]">duração</span>
      </span>
      <Separador />
      <span>
        <b className="font-bold text-[var(--wb-text)]">{cenas}</b> <span className="text-[var(--wb-text-dim)]">cenas</span>
        {riscadas > 0 && <span className="text-[var(--wb-text-dim)]"> · {riscadas} riscada(s) fora</span>}
      </span>
      <Separador />
      <span>
        <b className="font-bold text-[var(--wb-text)]">{cobertura.toFixed(0)}%</b>{' '}
        <span className="text-[var(--wb-text-dim)]">cobertura</span>
      </span>
      {temCenas && <LegendaRecolhida />}
    </div>
  );
}

export function LegendaRecolhida() {
  return (
    <details className="group relative ml-auto font-sans" data-testid="legenda-do-plano">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 text-[11px] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] [&::-webkit-details-marker]:hidden">
        Legenda
        <Icon name="chevron-down" className="transition-transform group-open:rotate-180" />
      </summary>
      <LegendaDaOrigem className="absolute right-0 top-full z-20 mt-1 w-[240px] flex-col rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-2 shadow-md" />
    </details>
  );
}
