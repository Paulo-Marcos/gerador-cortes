import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { corteKey, cortesProjetoKey } from '@/shared/chavesDeCache';
import type { AdicionarDesvioRequest, Corte } from '@/types/models';
import { cortesApi, type AtualizarCorteRequest } from './api/cortes';
import { metadadosApi } from '@/features/metadata/api/metadados';

// O corte na edição: ler, editar, reordenar, dividir, juntar, aprovar, excluir,
// as marcas (Fire, leitura) e os trechos a remover. D-723: saiu do useEditor.

export { corteKey, cortesProjetoKey };

export function useCortesProjeto(projetoId: string | undefined) {
  return useQuery({
    queryKey: cortesProjetoKey(projetoId ?? ''),
    queryFn: () => cortesApi.listarCortes(projetoId!),
    enabled: !!projetoId,
    staleTime: 5_000,
  });
}

export function useCorte(corteId: string | undefined) {
  return useQuery({
    queryKey: corteKey(corteId ?? ''),
    queryFn: () => cortesApi.obterCorte(corteId!),
    enabled: !!corteId,
    staleTime: 1_000,
  });
}

export function invalidaCorte(
  qc: ReturnType<typeof useQueryClient>,
  corteId: string,
  projetoId?: string,
) {
  qc.invalidateQueries({ queryKey: corteKey(corteId) });
  if (projetoId) qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
}

export function useAtualizarCorte(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: AtualizarCorteRequest) => cortesApi.atualizarCorte(corteId, patch),
    onSuccess: (data) => {
      qc.setQueryData(corteKey(corteId), data);
      if (projetoId) qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
    },
  });
}

// F-057: reordena cortes do projeto. Optimistic update na lista para a UI
// nao piscar enquanto o backend processa.
export function useReordenarCortes(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cortesIds: string[]) => cortesApi.reordenarCortes(projetoId, cortesIds),
    onMutate: async (cortesIds) => {
      await qc.cancelQueries({ queryKey: cortesProjetoKey(projetoId) });
      const anterior = qc.getQueryData<Corte[]>(cortesProjetoKey(projetoId));
      if (anterior) {
        const porId = new Map(anterior.map((c) => [c.id, c] as const));
        const otimista = cortesIds
          .map((id, i) => {
            const c = porId.get(id);
            return c ? { ...c, numero: i + 1 } : null;
          })
          .filter((c): c is Corte => c !== null);
        qc.setQueryData(cortesProjetoKey(projetoId), otimista);
      }
      return { anterior };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.anterior) {
        qc.setQueryData(cortesProjetoKey(projetoId), ctx.anterior);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
    },
  });
}

/** F-057: helper para mover um corte 1 posicao para cima/baixo (-1 ou +1).
 *  Recebe a lista corrente como `{id}[]` (suporta tanto Corte quanto
 *  StatusExportCorte mapeado) e devolve a nova ordem dos ids ou null se a
 *  movimentacao sair dos limites. */
export function moverCorte(
  cortes: ReadonlyArray<{ id: string }>,
  corteId: string,
  delta: -1 | 1,
): string[] | null {
  const idx = cortes.findIndex((c) => c.id === corteId);
  if (idx < 0) return null;
  const novoIdx = idx + delta;
  if (novoIdx < 0 || novoIdx >= cortes.length) return null;
  const reordenados = cortes.slice();
  [reordenados[idx], reordenados[novoIdx]] = [reordenados[novoIdx], reordenados[idx]];
  return reordenados.map((c) => c.id);
}

// F-061: divide o corte em dois no ponto do ponteiro. Atualiza o cache do
// corte original e invalida a lista do projeto para o novo corte aparecer no
// menu de cortes. Retorna [original, novo].
export function useDividirCorte(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: (body: { ponto_seg?: number; ponto_hms?: string }) =>
      cortesApi.dividirCorte(corteId, body),
    onSuccess: (cortes) => {
      const [original] = cortes;
      if (original) qc.setQueryData(corteKey(original.id), original);
      invalidaCorte(qc, corteId, projetoId);
      notify('Corte dividido em dois.', { tone: 'success' });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao dividir corte.', { tone: 'error' });
    },
  });
}

// D-575: funde o corte com o vizinho seguinte. O sobrevivente pode ser OUTRO
// corte (quem comeca antes ganha), entao o cache do corte da rota tambem cai —
// se ele foi o absorvido, ja nao existe.
export function useJuntarCortes(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: (body: { outro_corte_id?: string } = {}) => cortesApi.juntarCortes(corteId, body),
    onSuccess: (corte) => {
      qc.setQueryData(corteKey(corte.id), corte);
      invalidaCorte(qc, corteId, projetoId);
      notify('Cortes juntados. Gere o bruto de novo para ver o resultado.', { tone: 'success' });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao juntar cortes.', { tone: 'error' });
    },
  });
}

export function useAprovar(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cortesApi.aprovarCorte(corteId),
    onSuccess: () => invalidaCorte(qc, corteId, projetoId),
  });
}

export function useDeletarCorte(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cortesApi.deletarCorte(corteId),
    onSuccess: () => invalidaCorte(qc, corteId, projetoId),
  });
}

export function useToggleFire(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => metadadosApi.toggleFireMeta(corteId),
    onSuccess: () => {
      invalidaCorte(qc, corteId, projetoId);
      qc.invalidateQueries({ queryKey: ['metadado', corteId] });
    },
  });
}

export function useToggleLeitura(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corteAtual: Corte) =>
      cortesApi.atualizarCorte(corteId, { is_leitura: corteAtual.is_leitura ? 0 : 1 }),
    onSuccess: (data) => {
      qc.setQueryData(corteKey(corteId), data);
      if (projetoId) qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['metadado', corteId] });
    },
  });
}

export function useSincronizarTranscricao(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cortesApi.sincronizarTranscricao(corteId),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function usePromptDesvios(corteId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['corte', corteId, 'desvios', 'prompt'],
    queryFn: () => cortesApi.obterPromptDesvios(corteId),
    enabled,
    staleTime: 60_000,
  });
}

export function useImportarDesvios(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trechos: unknown[]) => cortesApi.importarDesvios(corteId, trechos),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function useAnalisarDesvios(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limparAnteriores: boolean) => cortesApi.analisarDesviosCorte(corteId, limparAnteriores),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function useAdicionarDesvio(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdicionarDesvioRequest) => cortesApi.adicionarDesvio(corteId, body),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function useRemoverDesvio(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (desvioIndex: number) => cortesApi.removerDesvio(corteId, desvioIndex),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}
