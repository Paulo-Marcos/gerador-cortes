import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cortesProjetoKey } from '@/hooks/useEditor';
import { ordemCortesApi, type CorteComPin } from '@/features/editor/ordem/api';

// D-448: o pin de posição — o ÚNICO jeito de um corte sair da ordem do tempo.
// Hook próprio (não `hooks/useEditor.ts`, sob lock): a ordem é derivada, não
// faz parte do ciclo de edição do corte.

export function useNormalizarOrdem(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ordemCortesApi.normalizar(projetoId),
    onSuccess: (cortes: CorteComPin[]) => {
      qc.setQueryData(cortesProjetoKey(projetoId), cortes);
    },
  });
}

export function useFixarPosicao(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ corteId, posicao }: { corteId: string; posicao: number | null }) =>
      ordemCortesApi.fixarPosicao(corteId, posicao),
    onSuccess: (cortes: CorteComPin[]) => {
      qc.setQueryData(cortesProjetoKey(projetoId), cortes);
    },
  });
}
