import { useCorte } from '@/features/editor/useCortes';
import type { Corte } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { LegendaDaOrigem } from './CenaComOrigem';

// ─────────────────────────────────────────────────────────────────────────────
// O pé do cabeçalho do plano: a legenda das origens (D-1070) e, logo abaixo, o que a
// última geração deixou de fora. D-1075 (RN-39): gerar de novo mantém as cenas manuais
// e descarta a cena da IA que cai em cima de uma delas. O plano gravado diz quantas; a
// Pós conta numa frase, sem modal. O plano que o operador salva não traz a contagem, e
// a frase sai junto.
// ─────────────────────────────────────────────────────────────────────────────

/** Quantas cenas da última geração ficaram de fora pelas manuais; o plano em lista é antigo. */
export function contarDescartadas(cenasRemotion: Corte['cenas_remotion'] | undefined): number {
  if (!cenasRemotion || Array.isArray(cenasRemotion)) return 0;
  return cenasRemotion.descartadas_pelas_manuais ?? 0;
}

export function descreverDescartadas(quantas: number): string | null {
  if (quantas <= 0) return null;
  return quantas === 1
    ? '1 cena da IA ficou de fora porque caía em cima de uma cena manual.'
    : `${quantas} cenas da IA ficaram de fora porque caíam em cima de cenas manuais.`;
}

export function AvisoDasDescartadas({ quantas }: { quantas: number }) {
  const frase = descreverDescartadas(quantas);
  if (!frase) return null;
  return (
    <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--wb-text-dim)]">
      <Icon name="pen" className="text-[var(--wb-ok-ink)]" />
      {frase}
    </p>
  );
}

/** Lê o corte em cache: o aviso chega por qualquer caminho de geração, até a cadeia do bruto. */
export function LegendaDoPlano({ corteId, temCenas }: { corteId: string; temCenas: boolean }) {
  const { data: corte } = useCorte(corteId);
  return (
    <>
      {temCenas && <LegendaDaOrigem className="mt-2" />}
      <AvisoDasDescartadas quantas={contarDescartadas(corte?.cenas_remotion)} />
    </>
  );
}
