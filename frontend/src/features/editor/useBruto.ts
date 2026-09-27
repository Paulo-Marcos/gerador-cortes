import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import type { StatusBrutoResponse } from '@/types/models';
import { brutoApi, type GerarBrutoOpcoes } from './api/bruto';
import { invalidaCorte } from './useCortes';

// O vídeo bruto do corte: o status, os passos e a geração. D-723: saiu do useEditor.

export const statusBrutoKey = (id: string) => ['corte', id, 'status-bruto'] as const;

export function useStatusBruto(corteId: string | undefined) {
  return useQuery({
    queryKey: statusBrutoKey(corteId ?? ''),
    queryFn: () => brutoApi.statusClipBruto(corteId!),
    enabled: !!corteId,
    // Polling enquanto o backend processa ('cortando' é o valor real enviado).
    // 2,5s para o botão liberar logo que o vídeo fica pronto (antes era 15s).
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processando' || status === 'cortando' ? 2_500 : false;
    },
  });
}

// F-038 — passos do gerar/regerar bruto, para o dropdown de acompanhamento.
// Faz polling enquanto o bruto processa (ativo) OU enquanto algum passo do
// backend ainda está rodando (ex.: cenas via Claude depois do vídeo pronto).
export function useBrutoProgress(corteId: string | undefined, ativo: boolean) {
  return useQuery({
    queryKey: ['corte', corteId, 'bruto-progress'],
    queryFn: () => brutoApi.brutoProgress(corteId!),
    enabled: !!corteId,
    refetchInterval: (query) => {
      const passos =
        (query.state.data as { passos?: { status: string }[] } | undefined)?.passos ?? [];
      const rodando = passos.some((p) => p.status === 'rodando');
      return ativo || rodando ? 1_500 : false;
    },
  });
}

export function useGerarBruto(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    // D-160 — opts opcionais gateiam transcrição/cenas na regeração; ausência
    // (1ª geração) faz o backend rodar a cadeia completa.
    mutationFn: (opts?: GerarBrutoOpcoes) => brutoApi.cortarClipBruto(corteId, opts),
    // Optimistic update: marca o status como 'cortando' antes mesmo da
    // requisição voltar.  Sem isso, a API retorna em ~100ms (porque é
    // fire-and-forget) e o polling só refetcha 2s depois — nessa janela
    // o botão "Regerar bruto" volta a ficar disponível, e cliques rápidos
    // do usuário disparam uma nova confirmação de 2 cliques (4 cliques no
    // total para 1 geração).
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: statusBrutoKey(corteId) });
      const previous = qc.getQueryData<StatusBrutoResponse>(statusBrutoKey(corteId));
      qc.setQueryData<StatusBrutoResponse>(statusBrutoKey(corteId), {
        corte_id: corteId,
        status: 'cortando',
        clip_gerado: false,
        clip_path: previous?.clip_path ?? '',
      });
      return { previous };
    },
    onSuccess: () => {
      notify('Recorte bruto enfileirado.', { tone: 'success' });
      // Refetcha pra confirmar com a verdade do backend (caso o status
      // tenha avançado pra "pronto" ou "erro" muito rápido).
      qc.invalidateQueries({ queryKey: statusBrutoKey(corteId) });
      invalidaCorte(qc, corteId, projetoId);
    },
    onError: (error, _vars, context) => {
      // Reverte o otimismo em caso de erro real (ex.: 404, 500).
      if (context && typeof context === 'object' && 'previous' in context) {
        const previous = (context as { previous?: StatusBrutoResponse }).previous;
        if (previous) qc.setQueryData(statusBrutoKey(corteId), previous);
        else qc.invalidateQueries({ queryKey: statusBrutoKey(corteId) });
      }
      notify(error instanceof Error ? error.message : 'Erro ao gerar bruto.', { tone: 'error' });
    },
  });
}
