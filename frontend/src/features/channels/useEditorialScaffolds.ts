// D-297: camada de I/O (react-query) da gestão de scaffolds. Mantém os
// componentes "burros" — eles só consomem estes hooks, sem fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  editorialScaffoldsApi,
  type ListaScaffoldsResponse,
} from '@/lib/editorialScaffoldsApi';

const SCAFFOLDS_KEY = ['editorial-scaffolds'] as const;

export function useEditorialScaffolds() {
  return useQuery<ListaScaffoldsResponse>({
    queryKey: SCAFFOLDS_KEY,
    queryFn: editorialScaffoldsApi.listar,
    staleTime: 5_000,
  });
}

export function useEditarScaffold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, scaffold }: { key: string; scaffold: string }) =>
      editorialScaffoldsApi.editar(key, scaffold),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCAFFOLDS_KEY }),
  });
}

export function useResetarScaffold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key }: { key: string }) => editorialScaffoldsApi.resetar(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCAFFOLDS_KEY }),
  });
}
