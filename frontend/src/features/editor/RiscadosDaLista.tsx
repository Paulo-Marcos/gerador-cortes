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

// O número e o título riscados: o traço apagado diz "saiu" sem tirar a leitura.
const RISCADO = 'line-through decoration-fg-3';

/** A seção, sem hook: o teste a desenha pelo HTML. Sem `style`: só classes da Sala escura. */
export function SecaoDosRiscados({ riscados, motivos, trazendo, onTrazerDeVolta }: SecaoDosRiscadosProps) {
  if (riscados.length === 0) return null;
  return (
    <details open data-sala="" className="text-corpo">
      <summary className="cursor-pointer rounded-ladrilho px-1.5 text-micro text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco">
        Riscados · {riscados.length}
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {riscados.map((corte) => (
          <div
            key={corte.id}
            data-riscado={corte.id}
            className="flex flex-col gap-1.5 rounded-campo border border-dashed border-fio-2 p-2"
          >
            <span className="flex min-w-0 gap-1.5 text-pequeno text-fg-2">
              <span className={`flex-none font-mono ${RISCADO}`}>#{corte.numero}</span>
              <span className={`min-w-0 font-semibold ${RISCADO}`}>{corte.titulo_proposto}</span>
            </span>
            {corte.motivo_riscado?.length ? (
              <span className="flex flex-wrap gap-1">
                {corte.motivo_riscado.map((slug) => (
                  <span key={slug} className="rounded-etiqueta bg-vidro-2 px-1.5 text-micro text-fg-2">
                    {nomearMotivo(slug, motivos)}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="text-micro text-fg-3">{FRASE_DO_RISCADO}</span>
            <button
              type="button"
              data-sala=""
              className="inline-flex h-botao-pq items-center justify-center gap-1.5 rounded-pilula border border-fio-2 bg-vidro-2 px-3 text-pequeno text-fg shadow-topo hover:bg-vidro-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:border-fio disabled:bg-transparent disabled:text-fg-off"
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

/** A seção dos riscados (no cabeçalho do editor, D-1150): lê os motivos do canal e traz de volta. */
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
