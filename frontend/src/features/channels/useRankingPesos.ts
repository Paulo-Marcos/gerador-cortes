// D-351: camada de I/O (react-query) da gestão dos pesos do ranking de lives.
// Mantém os componentes "burros" — eles só consomem estes hooks, sem fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  rankingPesosApi,
  type ListaRankingPesosResponse,
  type RankingPesosPayload,
} from '@/features/channels/api/pesosRanking';

const RANKING_PESOS_KEY = ['ranking-pesos'] as const;

export function useRankingPesos() {
  return useQuery<ListaRankingPesosResponse>({
    queryKey: RANKING_PESOS_KEY,
    queryFn: rankingPesosApi.listar,
    staleTime: 5_000,
  });
}

export function useSalvarRankingPesos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (valores: RankingPesosPayload) => rankingPesosApi.salvar(valores),
    onSuccess: () => qc.invalidateQueries({ queryKey: RANKING_PESOS_KEY }),
  });
}

export function useResetarRankingPesos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rankingPesosApi.resetar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: RANKING_PESOS_KEY }),
  });
}
