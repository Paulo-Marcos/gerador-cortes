import { useTelemetriaCortes } from '@/features/analises/useAnalises';
import type { TelemetriaCorteDiff } from '@/features/analises/api';
import type { Corte } from '@/types/models';

// ─────────────────────────────────────────────────────────────────
// D-999 · "O que você mudou"
//
// O voto de qualidade (D-419) virou carimbo: 95% dos votos eram 4 ou 5. No
// lugar dele, o modal mostra o que o operador FEZ com a proposta da IA —
// bordas, título, trechos —, calculado sozinho pela telemetria (D-303) a
// partir da proposta congelada. Nenhum clique a mais.
// ─────────────────────────────────────────────────────────────────

export type DiffDoCorte = Pick<TelemetriaCorteDiff, 'situacao' | 'mudancas'>;

/** O diff deste corte, tirado da telemetria do projeto (a mesma da aba Análises). */
export function useDiffDoCorte(corte: Pick<Corte, 'id' | 'projeto_id'>): DiffDoCorte | undefined {
  const telemetria = useTelemetriaCortes(corte.projeto_id);
  return telemetria.data?.cortes.find((c) => c.corte_id === corte.id);
}

export function MudancasDoCorte({ diff }: { diff: DiffDoCorte | undefined }) {
  if (!diff) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mute)' }}>O que você mudou</span>
      {diff.situacao !== 'com_snapshot' ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute)' }}>
          Não há proposta da IA guardada para comparar.
        </p>
      ) : diff.mudancas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5 }}>Nada: o corte segue a proposta da IA.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
          {diff.mudancas.map((m) => (
            <li key={m.tipo}>{m.descricao}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
