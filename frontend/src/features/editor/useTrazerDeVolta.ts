import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { mensagemErro } from '@/lib/mensagemErro';
import type { Corte } from '@/types/models';
import { cortesApi } from './api/cortes';
import { invalidaCorte } from './useCortes';

/**
 * D-1092: o "Trazer de volta" da seção Riscados. É a mesma volta do Desfazer do
 * aviso (D-1088, `POST /cortes/{id}/trazer-de-volta`): o corte volta à etapa de
 * antes e o backend gera de novo, sozinho, o bruto que o riscar soltou.
 * A tela fica onde está; o corte reaparece na lista.
 */
export function useTrazerDeVolta(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const trazer = useMutation({
    mutationFn: (corte: Corte) => cortesApi.trazerDeVolta(corte.id),
    onSuccess: (_resultado, corte) => invalidaCorte(qc, corte.id, projetoId),
    onError: (erro) => notify(mensagemErro(erro, 'Não deu para trazer o corte de volta.'), { tone: 'error' }),
  });
  return {
    trazerDeVolta: (corte: Corte) => trazer.mutate(corte),
    /** O corte que está voltando agora; `undefined` sem volta em curso. */
    trazendo: trazer.isPending ? trazer.variables?.id : undefined,
  };
}
