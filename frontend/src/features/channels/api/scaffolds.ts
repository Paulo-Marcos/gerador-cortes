import { api, dados, type Schema } from '@/shared/api';
// D-297: cliente HTTP da gestão de prompts-scaffold (contrato de saída) por canal.
// D-722: pelo cliente gerado do contrato. Endpoints irmãos sob /editorial-skills.

/** Um scaffold do canal: metadados + valor-do-canal + default (reset). */
export type EditorialScaffold = Schema<'ScaffoldDescritoResponse'>;
export type ListaScaffoldsResponse = Schema<'ListaScaffoldsResponse'>;

const doScaffold = (key: string) => ({ params: { path: { scaffold_key: key } } });

export const editorialScaffoldsApi = {
  listar: () => dados(api.GET('/api/editorial-skills/scaffolds')),

  editar: (key: string, scaffold: string) =>
    dados(api.PUT('/api/editorial-skills/scaffolds/{scaffold_key}', { ...doScaffold(key), body: { scaffold } })),

  resetar: (key: string) =>
    dados(api.POST('/api/editorial-skills/scaffolds/{scaffold_key}/reset', doScaffold(key))),
};
