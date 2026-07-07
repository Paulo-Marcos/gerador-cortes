// E-021: camada de I/O (react-query) da gestão de skills editoriais. Mantém os
// componentes "burros" — eles só consomem estes hooks, sem fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  editorialSkillsApi,
  type CampoReset,
  type ListaSkillsResponse,
  type UpdateSkillPayload,
} from '@/lib/editorialSkillsApi';

const SKILLS_KEY = ['editorial-skills'] as const;

export function useEditorialSkills() {
  return useQuery<ListaSkillsResponse>({
    queryKey: SKILLS_KEY,
    queryFn: editorialSkillsApi.listar,
    staleTime: 5_000,
  });
}

export function useEditarSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: UpdateSkillPayload }) =>
      editorialSkillsApi.editar(key, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: SKILLS_KEY }),
  });
}

export function useResetarSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, campos }: { key: string; campos: CampoReset[] }) =>
      editorialSkillsApi.resetar(key, campos),
    onSuccess: () => qc.invalidateQueries({ queryKey: SKILLS_KEY }),
  });
}
