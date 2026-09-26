import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avaliacaoBrutoApi, type AvaliacaoBruto } from '@/features/editor/avaliacao/api/avaliacaoBruto';
import type { ProviderIA } from '@/lib/providerIa';

// D-447: estado da avaliação automática da ESTRUTURA do bruto. Hook próprio
// (não `hooks/useEditor.ts`, sob lock) — a avaliação observa o bruto, não
// participa da edição dele.

export const avaliacaoBrutoKey = (corteId: string) => ['avaliacao-bruto', corteId] as const;
export const avaliacaoBrutoHistoricoKey = (corteId: string) =>
  ['avaliacao-bruto', corteId, 'historico'] as const;

export function useAvaliacaoBruto(corteId: string | undefined) {
  return useQuery({
    queryKey: avaliacaoBrutoKey(corteId ?? ''),
    queryFn: () => avaliacaoBrutoApi.obter(corteId as string),
    enabled: Boolean(corteId),
  });
}

export function useHistoricoAvaliacaoBruto(corteId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: avaliacaoBrutoHistoricoKey(corteId ?? ''),
    queryFn: () => avaliacaoBrutoApi.historico(corteId as string),
    // Só busca a série quando o editor abre o histórico: no uso comum
    // interessa a nota atual, e a série cresce a cada geração de bruto.
    enabled: Boolean(corteId) && habilitado,
  });
}

export function useReavaliarBruto(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ProviderIA = 'claude') =>
      avaliacaoBrutoApi.reavaliar(corteId, provider),
    onSuccess: (avaliacao: AvaliacaoBruto) => {
      qc.setQueryData(avaliacaoBrutoKey(corteId), avaliacao);
      qc.invalidateQueries({ queryKey: avaliacaoBrutoHistoricoKey(corteId) });
    },
  });
}
