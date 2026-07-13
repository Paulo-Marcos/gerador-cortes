// D-348: camada de I/O (react-query) da gestão de prompts utilitários. Mantém os
// componentes "burros" — eles só consomem estes hooks, sem fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  promptsUtilitariosApi,
  type ListaPromptsUtilitariosResponse,
} from '@/lib/promptsUtilitariosApi';

const PROMPTS_KEY = ['prompts-utilitarios'] as const;

export function usePromptsUtilitarios() {
  return useQuery<ListaPromptsUtilitariosResponse>({
    queryKey: PROMPTS_KEY,
    queryFn: promptsUtilitariosApi.listar,
    staleTime: 5_000,
  });
}

export function useEditarPromptUtilitario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, prompt }: { key: string; prompt: string }) =>
      promptsUtilitariosApi.editar(key, prompt),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  });
}

export function useResetarPromptUtilitario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key }: { key: string }) => promptsUtilitariosApi.resetar(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMPTS_KEY }),
  });
}
