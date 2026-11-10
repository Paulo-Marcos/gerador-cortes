import type { useToast } from '@/components/ui/toaster';
import { mensagemErro } from '@/lib/mensagemErro';

export const DURACAO_DO_AVISO_DA_JUNCAO_MS = 10_000;

export const MENSAGEM_DA_JUNCAO =
  'O outro corte ficou riscado, com o trabalho dele. Gere o bruto de novo para ver o resultado.';

type Toast = Pick<ReturnType<typeof useToast>, 'notify' | 'dismiss'>;

/**
 * D-1097: o aviso da junção, no lugar do confirm do navegador que vinha antes.
 * O outro corte não some: fica riscado, e o "Trazer de volta" do aviso o
 * devolve com a etapa de antes e o bruto gerado de novo (a mesma volta da
 * seção Riscados). Sem o id do outro corte não há o que trazer, e o aviso só informa.
 */
export function avisarDaJuncao({ notify, dismiss }: Toast, trazerDeVolta?: () => Promise<void>) {
  const trazer = async () => {
    dismiss(id);
    try {
      await trazerDeVolta?.();
    } catch (erro) {
      notify(mensagemErro(erro, 'Não deu para trazer o corte de volta.'), { tone: 'error' });
    }
  };
  const id = notify(MENSAGEM_DA_JUNCAO, {
    title: 'Cortes juntados.',
    tone: 'success',
    duracaoMs: DURACAO_DO_AVISO_DA_JUNCAO_MS,
    conteudo: trazerDeVolta ? (
      <button type="button" className="btn btn-ghost" style={{ height: 24, fontSize: 11.5 }} onClick={() => void trazer()}>
        Trazer de volta
      </button>
    ) : undefined,
  });
}
