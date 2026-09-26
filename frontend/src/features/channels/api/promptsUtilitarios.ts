import { api, dados, type Schema } from '@/shared/api';
// Cliente HTTP da gestão de prompts utilitários por canal.
// D-722: pelo cliente gerado do contrato. Endpoints sob /editorial-skills.

/** Um prompt utilitário do canal: metadados + valor-do-canal + default (reset). */
export type PromptUtilitario = Schema<'PromptUtilitarioResponse'>;
export type ListaPromptsUtilitariosResponse = Schema<'ListaPromptsUtilitariosResponse'>;

const doPrompt = (key: string) => ({ params: { path: { key } } });

export const promptsUtilitariosApi = {
  listar: () => dados(api.GET('/api/editorial-skills/prompts-utilitarios')),

  editar: (key: string, prompt: string) =>
    dados(api.PUT('/api/editorial-skills/prompts-utilitarios/{key}', { ...doPrompt(key), body: { prompt } })),

  resetar: (key: string) =>
    dados(api.POST('/api/editorial-skills/prompts-utilitarios/{key}/reset', doPrompt(key))),
};
