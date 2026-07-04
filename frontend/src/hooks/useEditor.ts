import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type GerarBrutoOpcoes } from '@/lib/api';
import { exportStatusKey } from './useProjetoDetalhe';
import { useToast } from '@/components/ui/toaster';
import type { FaseRender } from '@/features/post-production/renderEtapas';
import type {
  AdicionarDesvioRequest,
  CenasRemotionPayload,
  Corte,
  PipelineStatusResponse,
  StatusBrutoResponse,
} from '@/types/models';

export type RenderStartFrom = 'auto' | 'grade' | 'overlays' | 'overlays_continuar' | 'render_final';

export const corteKey = (id: string) => ['corte', id] as const;
export const cortesProjetoKey = (id: string) => ['cortes', 'projeto', id] as const;
export const statusBrutoKey = (id: string) => ['corte', id, 'status-bruto'] as const;
export const pipelineStatusKey = (id: string) => ['corte', id, 'pipeline-status'] as const;
const EDITOR_API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

interface RetratosCenasStats {
  total_fichas: number;
  atualizados: number;
  ja_tinham: number;
  nao_encontrados: number;
  sem_nome: number;
  erros: number;
  nomes_sem_retrato: string[];
  nomes_com_erro: string[];
}

export interface PreencherRetratosCenasResponse {
  message: string;
  corte_id: string;
  retratos: RetratosCenasStats;
  cenas: unknown[];
}

async function preencherRetratosCenas(corteId: string): Promise<PreencherRetratosCenasResponse> {
  const res = await fetch(`${EDITOR_API_BASE}/cortes/${corteId}/cenas-remotion/retratos`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }
  return (await res.json()) as PreencherRetratosCenasResponse;
}

export interface RetratoBancoResponse {
  nome: string;
  slug: string;
  url: string;
  fonte: string;
  pagina_wikipedia: string | null;
}

export async function salvarRetratoDeUrl(nome: string, url: string): Promise<RetratoBancoResponse> {
  const res = await fetch(`${EDITOR_API_BASE}/retratos/salvar-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, url }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }
  return (await res.json()) as RetratoBancoResponse;
}

export function useCortesProjeto(projetoId: string | undefined) {
  return useQuery({
    queryKey: cortesProjetoKey(projetoId ?? ''),
    queryFn: () => api.listarCortes(projetoId!),
    enabled: !!projetoId,
    staleTime: 5_000,
  });
}

export function useCorte(corteId: string | undefined) {
  return useQuery({
    queryKey: corteKey(corteId ?? ''),
    queryFn: () => api.obterCorte(corteId!),
    enabled: !!corteId,
    staleTime: 1_000,
  });
}

export function useStatusBruto(corteId: string | undefined) {
  return useQuery({
    queryKey: statusBrutoKey(corteId ?? ''),
    queryFn: () => api.statusClipBruto(corteId!),
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
    queryFn: () => api.brutoProgress(corteId!),
    enabled: !!corteId,
    refetchInterval: (query) => {
      const passos =
        (query.state.data as { passos?: { status: string }[] } | undefined)?.passos ?? [];
      const rodando = passos.some((p) => p.status === 'rodando');
      return ativo || rodando ? 1_500 : false;
    },
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
    mutationFn: (patch: Partial<Corte>) => api.atualizarCorte(corteId, patch),
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
    mutationFn: (cortesIds: string[]) => api.reordenarCortes(projetoId, cortesIds),
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
      api.dividirCorte(corteId, body),
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

export function useAprovar(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.aprovarCorte(corteId),
    onSuccess: () => invalidaCorte(qc, corteId, projetoId),
  });
}

export function useDeletarCorte(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deletarCorte(corteId),
    onSuccess: () => invalidaCorte(qc, corteId, projetoId),
  });
}

export function useToggleFire(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.toggleFireMeta(corteId),
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
      api.atualizarCorte(corteId, { is_leitura: !corteAtual.is_leitura }),
    onSuccess: (data) => {
      qc.setQueryData(corteKey(corteId), data);
      if (projetoId) qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['metadado', corteId] });
    },
  });
}

export function useGerarBruto(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    // D-160 — opts opcionais gateiam transcrição/cenas na regeração; ausência
    // (1ª geração) faz o backend rodar a cadeia completa.
    mutationFn: (opts?: GerarBrutoOpcoes) => api.cortarClipBruto(corteId, opts),
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
    ) => api.renderizarRemotion(corteId, options),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: pipelineStatusKey(corteId) });
      const previous = qc.getQueryData<PipelineStatusResponse>(pipelineStatusKey(corteId));
      qc.setQueryData<PipelineStatusResponse>(pipelineStatusKey(corteId), {
        fases: previous?.fases ?? {
          raw: true,
          grade: false,
          overlays: false,
          compose: false,
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
    queryFn: () => api.obterPipelineStatus(corteId!),
    enabled: !!corteId,
    refetchInterval: (query) => (forcePolling || query.state.data?.running ? 2_000 : false),
  });
}

export function useSincronizarPosProducao(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sincronizarPosProducao(corteId),
    onSuccess: () => invalidaCorte(qc, corteId, projetoId),
  });
}

export function useSincronizarTranscricao(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sincronizarTranscricao(corteId),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function usePromptDesvios(corteId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['corte', corteId, 'desvios', 'prompt'],
    queryFn: () => api.obterPromptDesvios(corteId),
    enabled,
    staleTime: 60_000,
  });
}

export function useImportarDesvios(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trechos: unknown[]) => api.importarDesvios(corteId, trechos),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function useAnalisarDesvios(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limparAnteriores: boolean) => api.analisarDesviosCorte(corteId, limparAnteriores),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function useAdicionarDesvio(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdicionarDesvioRequest) => api.adicionarDesvio(corteId, body),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

export function useRemoverDesvio(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (desvioIndex: number) => api.removerDesvio(corteId, desvioIndex),
    onSuccess: (data) => qc.setQueryData(corteKey(corteId), data),
  });
}

// F-038 — regera os trechos a remover (desvios) do corte via Claude e
// ressincroniza a transcrição final. O endpoint não devolve o Corte, então
// invalidamos a query para refetch do corte atualizado.
export function useGerarTrechosClaude(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: () => api.gerarTrechosClaude(corteId),
    onSuccess: (data) => {
      const msg =
        data.novos > 0
          ? `+${data.novos} novo(s) trecho(s) via Claude (total: ${data.total_desvios}).`
          : `Nenhum trecho novo a remover (total: ${data.total_desvios}).`;
      notify(msg, { tone: 'success' });
      invalidaCorte(qc, corteId, projetoId);
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao gerar trechos via Claude.', {
        tone: 'error',
      });
    },
  });
}

// F-038 — gera as cenas Remotion do corte via Claude (skill cenas-expert).
export function useGerarCenasClaude(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: () => api.gerarCenasClaude(corteId),
    onSuccess: (data) => {
      notify(`${data.total_cenas} cena(s) gerada(s) via Claude.`, { tone: 'success' });
      invalidaCorte(qc, corteId, projetoId);
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao gerar cenas via Claude.', {
        tone: 'error',
      });
    },
  });
}

// F-038 — gera os metadados do corte via Claude (skill metadados-expert).
export function useGerarMetadadosClaude(corteId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: () => api.gerarMetadadosClaude(corteId),
    onSuccess: () => {
      notify('Metadados gerados via Claude.', { tone: 'success' });
      qc.invalidateQueries({ queryKey: ['metadado', corteId] });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao gerar metadados via Claude.', {
        tone: 'error',
      });
    },
  });
}

// ─── Cenas Remotion ─────────────────────────────────────────────────

export function useGerarCenasRemotion(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.gerarCenasRemotion(corteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: corteKey(corteId) }),
  });
}

export function useImportarCenasRemotion(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CenasRemotionPayload) => api.importarCenasRemotion(corteId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: corteKey(corteId) }),
  });
}

export function usePreencherRetratosCenas(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => preencherRetratosCenas(corteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: corteKey(corteId) }),
  });
}

export function useValidarCenasRemotion(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (validado: boolean = true) => api.validarCenasRemotion(corteId, validado),
    onSuccess: (data) => {
      qc.setQueryData(corteKey(corteId), data);
      const projeto = projetoId ?? data.projeto_id;
      if (projeto) {
        qc.invalidateQueries({ queryKey: cortesProjetoKey(projeto) });
        // Forca refetch da pagina de cortes (a query usa refetchInterval=8s,
        // mas o feedback imediato e mais responsivo).
        qc.invalidateQueries({ queryKey: exportStatusKey(projeto), refetchType: 'all' });
      }
    },
  });
}

export function usePromptCenasRemotion(corteId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['corte', corteId, 'cenas-remotion', 'prompt'],
    queryFn: () => api.obterPromptCenasRemotion(corteId),
    enabled,
    staleTime: 60_000,
  });
}

export function useStudioUrl(corteId: string) {
  return useMutation({
    mutationFn: () => api.obterRemotionStudioUrl(corteId),
  });
}
