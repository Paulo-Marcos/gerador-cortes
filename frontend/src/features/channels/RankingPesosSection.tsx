// D-351: seção "Pesos do ranking de lives" na página de Canais. Container: orquestra
// o I/O (hooks em useRankingPesos) e delega a renderização ao formulário burro. Os
// pesos (views/likes/comentários/sentimento/recência) e a meia-vida da recência,
// antes só no .env, viram editáveis por canal — com o rótulo de cada critério à mostra.
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import type { RankingPesosPayload } from '@/features/channels/api/pesosRanking';
import { RankingPesosForm } from './RankingPesosForm';
import {
  useRankingPesos,
  useResetarRankingPesos,
  useSalvarRankingPesos,
} from './useRankingPesos';

function mensagemErro(erro: unknown, fallback: string): string {
  return erro instanceof Error ? erro.message : fallback;
}

export function RankingPesosSection() {
  const { notify } = useToast();
  const pesosQuery = useRankingPesos();
  const salvar = useSalvarRankingPesos();
  const resetar = useResetarRankingPesos();

  const pending = salvar.isPending || resetar.isPending;
  const criterios = pesosQuery.data?.criterios ?? [];

  const aoSalvar = (valores: RankingPesosPayload) => {
    salvar.mutate(valores, {
      onSuccess: () => notify('Pesos do ranking atualizados.', { tone: 'success' }),
      onError: (erro) => notify(mensagemErro(erro, 'Erro ao salvar os pesos.'), { tone: 'error' }),
    });
  };

  const aoResetar = () => {
    resetar.mutate(undefined, {
      onSuccess: () => notify('Pesos restaurados ao padrão.', { tone: 'info' }),
      onError: (erro) => notify(mensagemErro(erro, 'Erro ao resetar.'), { tone: 'error' }),
    });
  };

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Pesos do ranking de lives</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        Quanto cada critério pesa ao ranquear as lives candidatas do canal-fonte. Os pesos são
        relativos (o resultado é reescalonado para 0-100), então o que importa é a proporção entre
        eles. A meia-vida controla a rapidez com que uma live perde relevância pela idade. Edite por
        canal; o padrão fica disponível para resetar.
      </p>

      {pesosQuery.isLoading && (
        <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          Carregando pesos…
        </p>
      )}

      {pesosQuery.isError && (
        <div className="grid gap-3 rounded-[var(--radius)] border border-error/30 bg-[color-mix(in_oklch,var(--error)_10%,var(--wb-bg-card))] p-4">
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text)]">
            <AlertTriangle size={16} aria-hidden className="text-error" />
            {mensagemErro(pesosQuery.error, 'Não foi possível carregar os pesos.')}
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => pesosQuery.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {criterios.length > 0 && (
        <RankingPesosForm
          criterios={criterios}
          pending={pending}
          onSave={aoSalvar}
          onReset={aoResetar}
        />
      )}
    </section>
  );
}
