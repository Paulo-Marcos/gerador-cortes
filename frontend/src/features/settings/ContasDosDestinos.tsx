// D-980 (RN-31): a conta em que cada destino publica. O robô aprende a conta no
// primeiro envio e, dali em diante, recusa qualquer outra. Esquecer é o gesto
// de quem trocou de conta de propósito: o envio seguinte aprende a nova.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { settingsApi, type ContaDoDestino } from './api';

export const CHAVE_CONTAS_DOS_DESTINOS = ['contas-dos-destinos'];

/** O que a linha mostra: a conta aprendida, ou a promessa de aprender. */
export function descreverConta(conta: ContaDoDestino): string {
  if (!conta.conta_id) return 'Aprende no próximo envio';
  return conta.nome ? `${conta.nome} · ${conta.conta_id}` : `Conta ${conta.conta_id}`;
}

export function ContasDosDestinos() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryKey: CHAVE_CONTAS_DOS_DESTINOS,
    queryFn: settingsApi.listarContasDosDestinos,
  });
  const mutation = useMutation({
    mutationFn: settingsApi.esquecerContaDoDestino,
    onSuccess: (contas) => {
      queryClient.setQueryData(CHAVE_CONTAS_DOS_DESTINOS, contas);
      notify('Conta esquecida: o próximo envio aprende a nova.', {
        tone: 'success',
        title: 'Ajustes',
      });
    },
    onError: () => notify('Não foi possível esquecer a conta.', { tone: 'error', title: 'Ajustes' }),
  });

  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
        Conta de cada destino
      </legend>
      {(query.data ?? []).map((conta) => (
        <div
          key={conta.destino}
          className="flex items-center justify-between gap-3 text-sm text-[var(--wb-text)]"
        >
          <span className="min-w-0">
            <span className="font-semibold">{conta.rotulo}</span>
            <span className="block truncate text-xs text-[var(--wb-text-mute)]">
              {descreverConta(conta)}
            </span>
          </span>
          {conta.conta_id && (
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(conta.destino)}
              className="h-8 shrink-0 rounded-[var(--radius-sm)] border border-[var(--wb-border)] px-3 text-xs font-semibold text-[var(--wb-text)] transition-colors hover:border-[var(--wb-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              Esquecer
            </button>
          )}
        </div>
      ))}
      <span className="text-xs font-normal text-[var(--wb-text-mute)]">
        Antes de cada envio o robô confere a conta logada: diferente da daqui, ele não publica. Trocou
        de conta de propósito? Esqueça a antiga e envie de novo.
      </span>
    </fieldset>
  );
}
