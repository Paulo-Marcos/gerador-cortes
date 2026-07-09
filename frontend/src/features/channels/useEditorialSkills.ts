// E-021: camada de I/O (react-query) da gestão de skills editoriais. Mantém os
// componentes "burros" — eles só consomem estes hooks, sem fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  editorialSkillsApi,
  type CampoReset,
  type ListaSkillsResponse,
  type ListaVersoesResponse,
  type UpdateSkillPayload,
} from '@/lib/editorialSkillsApi';

const SKILLS_KEY = ['editorial-skills'] as const;
// D-312: chave do histórico de versões, por skill.
const versoesKey = (key: string) => ['editorial-skills', key, 'versoes'] as const;

export function useEditorialSkills() {
  return useQuery<ListaSkillsResponse>({
    queryKey: SKILLS_KEY,
    queryFn: editorialSkillsApi.listar,
    staleTime: 5_000,
  });
}

/** Invalida a lista de skills E o histórico da skill afetada (uma edição gera
 * uma nova versão, então o histórico precisa refazer o fetch). */
function useInvalidarSkill() {
  const qc = useQueryClient();
  return (key: string) => {
    void qc.invalidateQueries({ queryKey: SKILLS_KEY });
    void qc.invalidateQueries({ queryKey: versoesKey(key) });
  };
}

export function useEditarSkill() {
  const invalidar = useInvalidarSkill();
  return useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: UpdateSkillPayload }) =>
      editorialSkillsApi.editar(key, payload),
    onSuccess: (_data, { key }) => invalidar(key),
  });
}

export function useResetarSkill() {
  const invalidar = useInvalidarSkill();
  return useMutation({
    mutationFn: ({ key, campos }: { key: string; campos: CampoReset[] }) =>
      editorialSkillsApi.resetar(key, campos),
    onSuccess: (_data, { key }) => invalidar(key),
  });
}

// D-312: histórico de versões de uma skill (append-only). Só busca quando há uma
// skill selecionada (o modal de edição está aberto).
export function useVersoesSkill(key: string | null) {
  return useQuery<ListaVersoesResponse>({
    queryKey: versoesKey(key ?? ''),
    queryFn: () => editorialSkillsApi.listarVersoes(key as string),
    enabled: key !== null,
    staleTime: 5_000,
  });
}

// D-312: reverte a skill ao conteúdo de uma versão (cria uma nova versão vigente).
export function useReverterSkill() {
  const invalidar = useInvalidarSkill();
  return useMutation({
    mutationFn: ({ key, versao }: { key: string; versao: number }) =>
      editorialSkillsApi.reverter(key, versao),
    onSuccess: (_data, { key }) => invalidar(key),
  });
}
