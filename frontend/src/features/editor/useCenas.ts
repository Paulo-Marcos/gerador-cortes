import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { corteKey, cortesProjetoKey, exportStatusKey } from '@/shared/chavesDeCache';
import type { CenasRemotionPayload } from '@/types/models';
import { cenasApi } from './api/cenas';
import { retratosApi, type RetratoDoBanco } from './api/retratos';

// As cenas Remotion do corte e os retratos das fichas. D-723: saiu do useEditor,
// e os dois fetch diretos (retratos) passaram ao cliente gerado.

/** Guarda a imagem de uma URL no banco de retratos, para `nome`. */
export const salvarRetratoDeUrl = (nome: string, url: string): Promise<RetratoDoBanco> =>
  retratosApi.salvarDeUrl(nome, url);

export function useGerarCenasRemotion(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cenasApi.gerarCenasRemotion(corteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: corteKey(corteId) }),
  });
}

export function useImportarCenasRemotion(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CenasRemotionPayload) => cenasApi.importarCenasRemotion(corteId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: corteKey(corteId) }),
  });
}

export function usePreencherRetratosCenas(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cenasApi.preencherRetratos(corteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: corteKey(corteId) }),
  });
}

export function useValidarCenasRemotion(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (validado: boolean = true) => cenasApi.validarCenasRemotion(corteId, validado),
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
    queryFn: () => cenasApi.obterPromptCenasRemotion(corteId),
    enabled,
    staleTime: 60_000,
  });
}
