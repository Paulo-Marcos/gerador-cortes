import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FaseRender } from '@/features/post-production/renderEtapas';
import type { PipelineStatusResponse } from '@/types/models';
import { cortesApi } from './api/cortes';
import { renderApi } from './api/render';
import { corteKey, invalidaCorte } from './useCortes';

// O render do corte: disparar, acompanhar, sincronizar a pós e abrir no Studio.
// D-723: saiu do useEditor.

export type RenderStartFrom = 'auto' | 'grade' | 'overlays' | 'overlays_continuar' | 'render_final';

export const pipelineStatusKey = (id: string) => ['corte', id, 'pipeline-status'] as const;

export function useRenderizarRemotion(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      options: {
        startFrom?: RenderStartFrom;
        // D-064: render granular por etapas (parcial). Reusa FaseRender (D-082).
        pararEm?: FaseRender;
        continuar?: boolean;
        filtro?: string;
      } = {},
    ) => renderApi.renderizarRemotion(corteId, options),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: pipelineStatusKey(corteId) });
      const previous = qc.getQueryData<PipelineStatusResponse>(pipelineStatusKey(corteId));
      qc.setQueryData<PipelineStatusResponse>(pipelineStatusKey(corteId), {
        fases: previous?.fases ?? {
          raw: true,
          grade: false,
          overlays: false,
          compose: false,
          render_final: false,
          encode: false,
        },
        overlays_count: previous?.overlays_count ?? 0,
        tem_etapas_concluidas: previous?.tem_etapas_concluidas ?? false,
        state: 'running',
        progress: 1,
        stage: 'Render final enfileirado',
        running: true,
        elapsed_seconds: 0,
        error: '',
      });
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineStatusKey(corteId) });
      qc.invalidateQueries({ queryKey: corteKey(corteId) });
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(pipelineStatusKey(corteId), context.previous);
      else qc.invalidateQueries({ queryKey: pipelineStatusKey(corteId) });
    },
  });
}

export function usePipelineStatus(corteId: string | undefined, forcePolling = false) {
  return useQuery({
    queryKey: pipelineStatusKey(corteId ?? ''),
    queryFn: () => renderApi.obterPipelineStatus(corteId!),
    enabled: !!corteId,
    refetchInterval: (query) => (forcePolling || query.state.data?.running ? 2_000 : false),
  });
}

export function useSincronizarPosProducao(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cortesApi.sincronizarPosProducao(corteId),
    onSuccess: () => invalidaCorte(qc, corteId, projetoId),
  });
}

export function useStudioUrl(corteId: string) {
  return useMutation({
    mutationFn: () => renderApi.obterRemotionStudioUrl(corteId),
  });
}
