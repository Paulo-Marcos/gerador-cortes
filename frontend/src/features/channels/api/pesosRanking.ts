import { api, dados, type Schema } from '@/shared/api';
// Cliente HTTP dos pesos do ranking de lives por canal.
// D-722: pelo cliente gerado do contrato. Endpoints sob /editorial-skills.

export type ListaRankingPesosResponse = Schema<'ListaRankingPesosResponse'>;
/** Um critério do ranking: rótulo/descrição + valor-do-canal + default (reset). */
export type CriterioRanking = ListaRankingPesosResponse['criterios'][number];
/** Payload de edição: todos os critérios de uma vez (o reescalonamento é do conjunto). */
export type RankingPesosPayload = Schema<'UpdateRankingPesosRequest'>;

export const rankingPesosApi = {
  listar: () => dados(api.GET('/api/editorial-skills/ranking-pesos')),

  salvar: (valores: RankingPesosPayload) =>
    dados(api.PUT('/api/editorial-skills/ranking-pesos', { body: valores })),

  // GET (não POST): reset é idempotente e sem corpo; POST sem body disparava 422.
  resetar: () => dados(api.GET('/api/editorial-skills/ranking-pesos/reset')),
};
