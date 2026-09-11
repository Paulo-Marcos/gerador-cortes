import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { corteKey, cortesProjetoKey } from './useEditor';
import type { ArranjoBlocos } from '@/types/models';

/**
 * D-576 — a ordem de exibição dos blocos de um corte.
 *
 * Hook próprio, e não mais um bloco dentro de `useEditor`: aquele arquivo está
 * travado por três features e já passa de 550 linhas. Separar também deixa
 * honesta a dependência — o arranjo invalida o corte (a transcrição final muda
 * quando a ordem muda), mas o corte não sabe nada sobre o arranjo.
 */
export const arranjoKey = (corteId: string) => ['corte', corteId, 'arranjo'] as const;

const MUTACAO_ARRANJO = 'arranjo';

export function useArranjo(corteId: string, enabled = true) {
  return useQuery({
    queryKey: arranjoKey(corteId),
    queryFn: () => api.obterArranjo(corteId),
    enabled: enabled && Boolean(corteId),
  });
}

export function useArranjoOps(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();

  // Toda operação devolve o arranjo inteiro, então o cache é substituído em vez
  // de invalidado — a fila não pisca entre o clique e a resposta. O CORTE, sim,
  // é invalidado: reordenar reescreve a transcrição final.
  function aoConcluir(arranjo: ArranjoBlocos) {
    qc.setQueryData(arranjoKey(corteId), arranjo);
    qc.invalidateQueries({ queryKey: corteKey(corteId) });
    if (projetoId) qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
  }

  function aoFalhar(erro: unknown, acao: string) {
    notify(erro instanceof Error ? erro.message : `Erro ao ${acao}.`, { tone: 'error' });
  }

  const dividir = useMutation({
    mutationKey: [MUTACAO_ARRANJO, corteId, 'dividir'],
    mutationFn: (body: { ponto_seg: number }) => api.dividirBloco(corteId, body),
    onSuccess: aoConcluir,
    onError: (e) => aoFalhar(e, 'dividir o bloco'),
  });

  const mover = useMutation({
    mutationKey: [MUTACAO_ARRANJO, corteId, 'mover'],
    mutationFn: (body: { de_indice: number; para_indice: number }) =>
      api.moverBloco(corteId, body),
    onSuccess: aoConcluir,
    onError: (e) => aoFalhar(e, 'mover o bloco'),
  });

  const fundir = useMutation({
    mutationKey: [MUTACAO_ARRANJO, corteId, 'fundir'],
    mutationFn: (body: { indice: number }) => api.fundirBloco(corteId, body),
    onSuccess: aoConcluir,
    onError: (e) => aoFalhar(e, 'juntar os blocos'),
  });

  const restaurar = useMutation({
    mutationKey: [MUTACAO_ARRANJO, corteId, 'restaurar'],
    mutationFn: () => api.restaurarArranjo(corteId),
    onSuccess: (arranjo) => {
      aoConcluir(arranjo);
      notify('Ordem da live restaurada.', { tone: 'success' });
    },
    onError: (e) => aoFalhar(e, 'restaurar a ordem'),
  });

  const pendente = useIsMutating({ mutationKey: [MUTACAO_ARRANJO, corteId] }) > 0;

  return { dividir, mover, fundir, restaurar, pendente };
}
