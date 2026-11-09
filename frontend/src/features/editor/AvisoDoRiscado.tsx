import { useState } from 'react';
import type { OpcaoConfirmacao } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

/**
 * D-1088: o que o aviso do corte riscado oferece, sem diálogo antes do R.
 *
 * O motivo continua opcional (D-993, D-1006): cada chip marca ou desmarca e
 * grava na hora. O Desfazer devolve o corte à etapa de antes. O aviso mora
 * fora do QueryClient, então as duas ações chegam prontas.
 */
export function AvisoDoRiscado({
  motivos,
  onMotivos,
  onDesfazer,
}: {
  /** Vazio para o corte feito na mão: não há proposta da IA a medir. */
  motivos: readonly OpcaoConfirmacao[];
  onMotivos: (slugs: string[]) => void;
  /** Ausente quando o corte já estava riscado: não há etapa de antes. */
  onDesfazer?: () => void;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);

  function alternar(slug: string) {
    const novos = marcados.includes(slug) ? marcados.filter((s) => s !== slug) : [...marcados, slug];
    setMarcados(novos);
    onMotivos(novos);
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {motivos.length > 0 ? (
        <span role="group" aria-label="Motivo (opcional)" className="flex flex-wrap items-center gap-1">
          <span className="text-[11px]" style={{ color: 'var(--mute)' }}>
            Motivo:
          </span>
          {motivos.map((motivo) => {
            const ativo = marcados.includes(motivo.slug);
            return (
              <button
                key={motivo.slug}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternar(motivo.slug)}
                className={cn(
                  'rounded-[7px] border px-2 py-[2px] text-[11px] font-bold transition-colors',
                  ativo
                    ? 'border-[var(--sel-line)] bg-[var(--sel-bg)] text-[var(--sel-ink)]'
                    : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
                )}
              >
                {motivo.rotulo}
              </button>
            );
          })}
        </span>
      ) : null}
      {onDesfazer ? (
        <button type="button" className="btn btn-ghost" style={{ height: 24, fontSize: 11.5 }} onClick={onDesfazer}>
          Desfazer
        </button>
      ) : null}
    </span>
  );
}
