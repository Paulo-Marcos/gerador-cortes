// D-997: seção "Duração dos shorts" na tela de Canais. Container: lê e grava a
// faixa do canal ativo e entrega ao formulário burro. Antes a faixa era fixa no
// config.py (15 a 90 s); agora é do canal, como pede o ADR-0012.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { faixaDoShortApi } from '@/features/channels/api/faixaDoShort';
import { mensagemErro } from '@/lib/mensagemErro';
import { FaixaDoShortForm } from './FaixaDoShortForm';

const CHAVE_FAIXA_DO_SHORT = ['faixa-do-short'] as const;

export function FaixaDoShortSection() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({ queryKey: CHAVE_FAIXA_DO_SHORT, queryFn: faixaDoShortApi.ler });
  const salvar = useMutation({
    mutationFn: faixaDoShortApi.salvar,
    onSuccess: (gravada) => {
      queryClient.setQueryData(CHAVE_FAIXA_DO_SHORT, gravada);
      notify('Faixa de duração dos shorts atualizada.', { tone: 'success' });
    },
  });

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Duração dos shorts</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        A faixa em que a IA propõe os candidatos a short deste canal. Candidato fora dela é
        descartado antes de chegar a você.
      </p>
      {query.isError && (
        <p role="alert" className="text-xs text-error">
          {mensagemErro(query.error, 'Não foi possível carregar a faixa dos shorts.')}
        </p>
      )}
      {query.data && (
        <FaixaDoShortForm
          faixa={query.data}
          pending={salvar.isPending}
          erroDoServidor={
            salvar.isError ? mensagemErro(salvar.error, 'Erro ao salvar a faixa.') : null
          }
          onSave={(faixa) => salvar.mutate(faixa)}
        />
      )}
    </section>
  );
}
