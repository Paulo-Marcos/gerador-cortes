// D-351: seção "Pesos do ranking de lives" na página de Canais. Container: orquestra
// o I/O (hooks em useRankingPesos) e delega a renderização ao formulário burro. Os
// pesos (views/likes/comentários/sentimento/recência) e a meia-vida da recência,
// antes só no .env, viram editáveis por canal — com o rótulo de cada critério à mostra.
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { useToast } from '@/components/ui/toaster';
import type { RankingPesosPayload } from '@/features/channels/api/pesosRanking';
import { RankingPesosForm } from './RankingPesosForm';
import {
  useRankingPesos,
  useResetarRankingPesos,
  useSalvarRankingPesos,
} from './useRankingPesos';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';


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
    <section className="grid gap-3 rounded-campo border border-fio bg-painel-solido p-5">
      <h2 className="text-lg font-semibold text-fg">Pesos do ranking de lives</h2>
      <p className="text-sm text-fg-2">
        Quanto cada critério pesa ao ranquear as lives candidatas do canal-fonte. Os pesos são
        relativos (o resultado é reescalonado para 0-100), então o que importa é a proporção entre
        eles. A meia-vida controla a rapidez com que uma live perde relevância pela idade. Edite por
        canal; o padrão fica disponível para resetar.
      </p>

      {pesosQuery.isLoading && (
        <p className="flex items-center gap-2 text-linha text-fg-2">
          <Icon name="loader-2" size={16} className="animate-spin" />
          Carregando pesos…
        </p>
      )}

      {pesosQuery.isError && (
        <EstadoDeErro
          className="p-5"
          titulo="Não consegui carregar os pesos"
          motivo={mensagemErro(pesosQuery.error, 'O backend não respondeu. Tente de novo.')}
          aoTentar={() => void pesosQuery.refetch()}
        />
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
