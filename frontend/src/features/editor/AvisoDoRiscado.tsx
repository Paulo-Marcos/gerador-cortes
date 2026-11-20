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
const DESFAZER =
  'inline-flex h-6 items-center rounded-pilula px-2.5 text-pequeno text-fg-2 hover:bg-vidro-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

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
          <span className="text-micro text-fg-2">Motivo:</span>
          {motivos.map((motivo) => {
            const ativo = marcados.includes(motivo.slug);
            return (
              <button
                key={motivo.slug}
                type="button"
                aria-pressed={ativo}
                data-sala=""
                onClick={() => alternar(motivo.slug)}
                className={cn(
                  'rounded-pilula border px-2 py-[2px] text-micro transition-colors duration-150 motion-reduce:transition-none',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
                  ativo ? 'border-iris-fio bg-iris-suave text-iris-2' : 'border-fio-2 bg-poco text-fg-2 hover:text-fg',
                )}
              >
                {motivo.rotulo}
              </button>
            );
          })}
        </span>
      ) : null}
      {onDesfazer ? (
        <button type="button" data-sala="" className={DESFAZER} onClick={onDesfazer}>
          Desfazer
        </button>
      ) : null}
    </span>
  );
}
