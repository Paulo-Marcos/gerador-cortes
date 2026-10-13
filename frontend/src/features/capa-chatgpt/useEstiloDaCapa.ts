// D-909: camada de I/O (react-query) do estilo das capas do canal.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { estiloDaCapaApi, type ClaridadeDaCapa, type EstiloDaCapa } from './api';

const ESTILO_KEY = ['capa-chatgpt', 'estilo'] as const;
const CLARIDADE_KEY = ['capa-chatgpt', 'claridade'] as const;

export function useEstiloDaCapa() {
  return useQuery<EstiloDaCapa>({
    queryKey: ESTILO_KEY,
    queryFn: estiloDaCapaApi.ler,
    staleTime: 30_000,
  });
}

function useAlterarEstilo<T>(alterar: (valor: T) => Promise<EstiloDaCapa>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: alterar,
    onSuccess: (estilo) => {
      // A resposta já É o estilo novo; a meta pode ter mudado, e o aviso relê.
      qc.setQueryData(ESTILO_KEY, estilo);
      void qc.invalidateQueries({ queryKey: CLARIDADE_KEY });
    },
  });
}

export const useGravarEstiloDaCapa = () => useAlterarEstilo(estiloDaCapaApi.gravar);
export const useSubirFotoDoApresentador = () => useAlterarEstilo(estiloDaCapaApi.subirFoto);
export const useRemoverFotoDoApresentador = () => useAlterarEstilo(estiloDaCapaApi.removerFoto);

/**
 * A claridade da capa do YouTube do corte. `capaUrl` entra na chave porque a
 * URL da capa leva a versão (`?v=N`): capa trocada, medida nova.
 */
export function useClaridadeDaCapa(corteId: string, capaUrl?: string) {
  return useQuery<ClaridadeDaCapa | null>({
    queryKey: [...CLARIDADE_KEY, corteId, capaUrl],
    queryFn: () => estiloDaCapaApi.claridade(corteId),
    enabled: Boolean(corteId && capaUrl),
    staleTime: Infinity,
  });
}
