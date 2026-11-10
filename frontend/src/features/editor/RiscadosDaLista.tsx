import type { OpcaoConfirmacao } from '@/components/ui/confirm-dialog';
import { useMotivosDeExclusao } from '@/features/channels/useMotivosDeExclusao';
import type { Corte } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { MOTIVOS_APAGADO } from './motivoApagado';
import { useTrazerDeVolta } from './useTrazerDeVolta';

// ─────────────────────────────────────────────────────────────────
// D-1092 · os riscados no fim de "Cortes da live" (E2 do design da etapa
// Cortes, decisões P1 a P5 da D-1082).
//
// O corte riscado (D-1088) guarda a proposta e o trabalho e solta a mídia. Ele
// sai da lista e do J/K e fica aqui, como os trechos riscados ficam abaixo dos
// trechos (`fase1/TrechosList.tsx`): de onde se vê por que saiu e de onde volta.
// ─────────────────────────────────────────────────────────────────

export const FRASE_DO_RISCADO = 'Proposta e trabalho guardados; a mídia saiu.';
export const TRAZER_DE_VOLTA = 'Trazer de volta (regera o bruto)';

/** O rótulo do motivo: o do canal (inclusive o escondido depois), o padrão, ou o slug. */
export function nomearMotivo(slug: string, doCanal: readonly OpcaoConfirmacao[] = []): string {
  return (
    doCanal.find((m) => m.slug === slug)?.rotulo ??
    MOTIVOS_APAGADO.find((m) => m.slug === slug)?.rotulo ??
    slug
  );
}

type SecaoDosRiscadosProps = {
  riscados: readonly Corte[];
  motivos?: readonly OpcaoConfirmacao[];
  /** O id do corte que está voltando: o botão dele fica ocupado. */
  trazendo?: string;
  onTrazerDeVolta: (corte: Corte) => void;
};

const riscado = { textDecoration: 'line-through', textDecorationColor: 'var(--dim)' } as const;

/** A seção, sem hook: o teste a desenha pelo HTML. */
export function SecaoDosRiscados({ riscados, motivos, trazendo, onTrazerDeVolta }: SecaoDosRiscadosProps) {
  if (riscados.length === 0) return null;
  return (
    <details open style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line2)' }}>
      <summary className="lbl" style={{ cursor: 'pointer', padding: '0 6px' }}>
        Riscados · {riscados.length}
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {riscados.map((corte) => (
          <div
            key={corte.id}
            data-riscado={corte.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: 7,
              border: '1px dashed var(--line)',
              borderRadius: 'var(--r2)',
            }}
          >
            <span style={{ display: 'flex', gap: 5, minWidth: 0, fontSize: 11.5, color: 'var(--mute)' }}>
              <span style={{ ...riscado, fontFamily: 'var(--mono)', flex: 'none' }}>#{corte.numero}</span>
              <span style={{ ...riscado, fontWeight: 600, minWidth: 0 }}>{corte.titulo_proposto}</span>
            </span>
            {corte.motivo_riscado?.length ? (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {corte.motivo_riscado.map((slug) => (
                  <span key={slug} className="chip" style={{ background: 'var(--line2)', color: 'var(--mute)' }}>
                    {nomearMotivo(slug, motivos)}
                  </span>
                ))}
              </span>
            ) : null}
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>{FRASE_DO_RISCADO}</span>
            <button
              type="button"
              className="btn btn-sm"
              style={{ justifyContent: 'center' }}
              disabled={Boolean(trazendo)}
              aria-busy={trazendo === corte.id || undefined}
              onClick={() => onTrazerDeVolta(corte)}
            >
              <Icon name={trazendo === corte.id ? 'loader' : 'undo-2'} />
              {TRAZER_DE_VOLTA}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

/** A seção que a casca desenha no fim da lista: lê os motivos do canal e traz de volta. */
export function RiscadosDaLista({ projetoId, riscados }: { projetoId: string; riscados: readonly Corte[] }) {
  // Todos os motivos do canal, inclusive os escondidos: o riscado de ontem segue nomeado.
  const { data } = useMotivosDeExclusao();
  const { trazerDeVolta, trazendo } = useTrazerDeVolta(projetoId);
  return (
    <SecaoDosRiscados
      riscados={riscados}
      motivos={data?.motivos}
      trazendo={trazendo}
      onTrazerDeVolta={trazerDeVolta}
    />
  );
}
