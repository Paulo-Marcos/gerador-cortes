import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  avaliacaoCorteApi,
  type AvaliacaoCorte,
  type AvaliacaoCortePayload,
} from '@/features/editor/avaliacao/api/avaliacaoCorte';

// D-419: estado da avaliação de qualidade de um corte. Hook próprio (não
// `hooks/useEditor.ts`, sob lock) — a avaliação não participa do ciclo de
// edição do corte, só o observa.

export const avaliacaoCorteKey = (corteId: string) => ['avaliacao-corte', corteId] as const;
export const motivosAvaliacaoKey = ['avaliacao-corte', 'motivos'] as const;

export function useMotivosAvaliacao() {
  return useQuery({
    queryKey: motivosAvaliacaoKey,
    queryFn: avaliacaoCorteApi.motivos,
    // Vocabulário fechado no backend: não muda enquanto o app está aberto.
    staleTime: Infinity,
  });
}

export function useAvaliacaoCorte(corteId: string | undefined) {
  return useQuery({
    queryKey: avaliacaoCorteKey(corteId ?? ''),
    queryFn: () => avaliacaoCorteApi.obter(corteId as string),
    enabled: Boolean(corteId),
  });
}

export function useSalvarAvaliacaoCorte(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AvaliacaoCortePayload) => avaliacaoCorteApi.salvar(corteId, payload),
    onSuccess: (avaliacao: AvaliacaoCorte) => {
      qc.setQueryData(avaliacaoCorteKey(corteId), avaliacao);
    },
  });
}
