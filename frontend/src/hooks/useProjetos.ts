import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CriarProjetoRequest, Projeto, StatusProjeto } from '@/types/models';

const PROJETOS_KEY = ['projetos'] as const;

const STATUS_ATIVOS: ReadonlySet<StatusProjeto> = new Set([
  'baixando',
  'transcrevendo',
  'analisando',
]);
const POLL_ATIVO_MS = 3_000;
const POLL_IDLE_MS = 30_000;

function temProjetoAtivo(projetos: Projeto[] | undefined): boolean {
  return Boolean(projetos?.some((p) => STATUS_ATIVOS.has(p.status)));
}

export function useProjetos() {
  return useQuery({
    queryKey: PROJETOS_KEY,
    queryFn: api.listarProjetos,
    refetchInterval: (query) => (temProjetoAtivo(query.state.data) ? POLL_ATIVO_MS : POLL_IDLE_MS),
    staleTime: 5_000,
  });
}

export function useCriarProjeto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CriarProjetoRequest) => api.criarProjeto(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJETOS_KEY }),
  });
}

export function useRemoverProjeto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removerProjeto(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJETOS_KEY }),
  });
}

export function useLimparArquivos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.limparArquivosProjeto(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJETOS_KEY }),
  });
}

export function useReiniciarFalhados() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.reiniciarDownloadsFalhados(),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJETOS_KEY }),
  });
}

// ─── Domain helpers ────────────────────────────────────────────────

/**
 * Espelha frontend/src/app/pages/projetos/projetos.component.ts:252-254 (estaFinalizado).
 * Um projeto está "Pronto pro YouTube" quando todos os cortes propostos foram publicados.
 */
export function estaProntoPraYoutube(p: Projeto): boolean {
  return p.total_cortes > 0 && p.total_publicados === p.total_cortes;
}

export function temFalhados(projetos: Projeto[]): boolean {
  return projetos.some((p) => p.status === 'erro');
}
