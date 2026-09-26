// D-353: hook de I/O (react-query) da aba "Chamadas de IA". Mantém a aba "burra" —
// o componente só consome este hook, sem tocar em fetch direto.
import { useQuery } from '@tanstack/react-query';
import { llmCallsApi, type ListaLlmCallsResponse } from '@/features/ia';

const LLM_CALLS_KEY = ['analises', 'llm-calls'] as const;

/** Chamadas de IA recentes (as N mais novas), para a aba de telemetria. */
export function useLlmCalls(limite = 100) {
  return useQuery<ListaLlmCallsResponse>({
    queryKey: [...LLM_CALLS_KEY, limite],
    queryFn: () => llmCallsApi.listar({ limite }),
    staleTime: 15_000,
  });
}
