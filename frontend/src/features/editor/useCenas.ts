import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conferenciaDaOrigemKey, corteKey, cortesProjetoKey, exportStatusKey } from '@/shared/chavesDeCache';
import type { CenaRemotion, CenasRemotionPayload } from '@/types/models';
import { cenasApi } from './api/cenas';
import { retratosApi, type RetratoDoBanco } from './api/retratos';
import { useCorte } from './useCortes';

// As cenas Remotion do corte e os retratos das fichas. D-723: saiu do useEditor,
// e os dois fetch diretos (retratos) passaram ao cliente gerado.

/** Guarda a imagem de uma URL no banco de retratos, para `nome`. */
export const salvarRetratoDeUrl = (nome: string, url: string): Promise<RetratoDoBanco> =>
  retratosApi.salvarDeUrl(nome, url);

/** Os avisos de uma cena: o aviso a identifica por tipo + início, como ela está gravada. */
export function avisosDaCena(
  avisos: { tipo: string | null; inicio: number; mensagem: string }[],
  cena: Pick<CenaRemotion, 'tipo' | 'inicio'>,
): string[] {
  return avisos
    .filter((aviso) => aviso.tipo === cena.tipo && Math.abs(aviso.inicio - cena.inicio) < 0.01)
    .map((aviso) => aviso.mensagem);
}

/**
 * Os avisos de origem da cena (D-1018). A conferência é do que está gravado, então
 * acompanha a versão do corte no cache: salvou ou regerou, ela confere de novo.
 */
export function useAvisosDaCena(corteId: string, cena: CenaRemotion): string[] {
  return avisosDaCena(useAvisosDasCenas(corteId), cena);
}

/** Os avisos de todas as cenas do corte, para o plano (D-1070); sem corte, nenhum. */
export function useAvisosDasCenas(corteId: string | undefined) {
  const { dataUpdatedAt } = useCorte(corteId);
  const { data } = useQuery({
    queryKey: conferenciaDaOrigemKey(corteId ?? '', dataUpdatedAt),
    queryFn: () => cenasApi.conferirOrigem(corteId!),
    enabled: Boolean(corteId),
    placeholderData: keepPreviousData,
  });
  return data?.avisos ?? SEM_AVISOS;
}

const SEM_AVISOS: { tipo: string | null; inicio: number; mensagem: string }[] = [];

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
