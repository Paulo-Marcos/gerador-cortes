// D-908: camada de I/O (react-query) da referência do público e dos blocos por canal.
// Os componentes só consomem estes hooks, sem fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  escalonamentoApi,
  type FaixaDoPublico,
  type ParametrosDoDestino,
} from '@/features/channels/api/escalonamento';

export const ESCALONAMENTO_KEY = ['escalonamento-publicacao'] as const;

export function useEscalonamento() {
  return useQuery({
    queryKey: ESCALONAMENTO_KEY,
    queryFn: escalonamentoApi.ver,
    staleTime: 5_000,
  });
}

export function useSalvarPublico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (faixas: FaixaDoPublico[]) => escalonamentoApi.salvarPublico(faixas),
    onSuccess: (dados) => qc.setQueryData(ESCALONAMENTO_KEY, dados),
  });
}

export function useSalvarDestino() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ destino, parametros }: { destino: string; parametros: ParametrosDoDestino }) =>
      escalonamentoApi.salvarDestino(destino, parametros),
    onSuccess: (dados) => qc.setQueryData(ESCALONAMENTO_KEY, dados),
  });
}

export function useResetarEscalonamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chave: string) => escalonamentoApi.resetar(chave),
    onSuccess: (dados) => qc.setQueryData(ESCALONAMENTO_KEY, dados),
  });
}
