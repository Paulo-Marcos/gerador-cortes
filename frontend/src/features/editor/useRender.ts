import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { progressFromPipelineArtifacts } from '@/features/post-production/postProductionNavigation';
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

// ─── Render final (D-727) ──────────────────────────────────────────────────
//
// A Pós e a Revisão tinham o mesmo fluxo copiado, até a chave do localStorage:
// o pedido fica marcado em `render-final:{id}` para sobreviver a uma troca de
// tela, o status é seguido enquanto roda, e a marca sai quando o backend
// termina, falha ou fica ocioso. O que cada tela faz a mais entra pelas reações.

export interface ReacoesDoRenderFinal {
  /** Releia o status de exportação: é ele que diz à lista que o vídeo ficou pronto. */
  aoMudarStatus: () => void;
  /** O render deste corte acabou — concluído, com falha, ou o backend ficou ocioso. */
  aoAcabar?: (fim: { concluiu: boolean; falhou: boolean; status: PipelineStatusResponse }) => void;
  /** O pedido saiu, antes da resposta do backend. */
  aoIniciar?: () => void;
  /** O backend recusou o pedido. */
  aoFalharAoIniciar?: (erro: unknown) => void;
}

export interface OpcoesDoRenderFinal {
  startFrom: RenderStartFrom;
  pararEm?: FaseRender;
  continuar?: boolean;
}

/** O render acabou? Concluído, com falha, ou o backend ficou ocioso sem avisar. */
export function desfechoDoRender(status: PipelineStatusResponse) {
  const concluiu = status.state === 'done' || Boolean(status.fases?.encode);
  const falhou = status.state === 'error';
  const ocioso = status.running === false && status.state !== 'running';
  return { acabou: concluiu || falhou || ocioso, concluiu, falhou };
}

const chaveDoRenderFinal = (corteId: string) => `render-final:${corteId}`;
const renderFinalMarcado = (corteId: string) =>
  Boolean(corteId) && window.localStorage.getItem(chaveDoRenderFinal(corteId)) === 'running';

export function useRenderFinal(corteId: string, reacoes: ReacoesDoRenderFinal) {
  const renderFinal = useRenderizarRemotion(corteId);
  const [marcado, setMarcado] = useState(() => renderFinalMarcado(corteId));
  const [modalDeInicioAberto, setModalDeInicioAberto] = useState(false);
  const pipelineStatus = usePipelineStatus(corteId, marcado);
  // As reações mudam a cada render da tela; o efeito lê sempre as últimas.
  const reacoesRef = useRef(reacoes);
  reacoesRef.current = reacoes;

  useEffect(() => {
    setMarcado(renderFinalMarcado(corteId));
  }, [corteId]);

  useEffect(() => {
    if (!corteId || !marcado) return;
    const status = pipelineStatus.data;
    if (!status || renderFinal.isPending) return;
    const { acabou, concluiu, falhou } = desfechoDoRender(status);
    if (!acabou) return;
    window.localStorage.removeItem(chaveDoRenderFinal(corteId));
    setMarcado(false);
    reacoesRef.current.aoMudarStatus();
    reacoesRef.current.aoAcabar?.({ concluiu, falhou, status });
  }, [corteId, marcado, pipelineStatus.data, renderFinal.isPending]);

  function iniciar(opcoes: OpcoesDoRenderFinal) {
    if (!corteId) return;
    window.localStorage.setItem(chaveDoRenderFinal(corteId), 'running');
    setMarcado(true);
    setModalDeInicioAberto(false);
    reacoesRef.current.aoIniciar?.();
    renderFinal.mutate(opcoes, {
      onSuccess: () => {
        void pipelineStatus.refetch();
        reacoesRef.current.aoMudarStatus();
      },
      onError: (erro) => {
        window.localStorage.removeItem(chaveDoRenderFinal(corteId));
        setMarcado(false);
        reacoesRef.current.aoFalharAoIniciar?.(erro);
      },
    });
  }

  /** Com etapas já prontas no disco, pergunta antes (continuar ou do zero). */
  async function pedir() {
    if (marcado || pipelineStatus.data?.running) return;
    const status = (await pipelineStatus.refetch()).data;
    if (status?.running) return;
    if (status?.tem_etapas_concluidas) {
      setModalDeInicioAberto(true);
      return;
    }
    iniciar({ startFrom: 'grade' });
  }

  const rodando = Boolean(marcado || renderFinal.isPending || pipelineStatus.data?.running);
  const progresso = Math.round(
    pipelineStatus.data?.progress ??
      (rodando ? progressFromPipelineArtifacts(pipelineStatus.data?.fases) : 0),
  );

  return {
    renderFinal,
    pipelineStatus,
    marcado,
    rodando,
    progresso,
    modalDeInicioAberto,
    setModalDeInicioAberto,
    pedir,
    iniciar,
  };
}
