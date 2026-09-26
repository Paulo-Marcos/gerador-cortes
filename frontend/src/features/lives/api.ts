import { api, dados, type Schema } from '@/shared/api';

// Busca de lives do canal-fonte e ranking de candidatas (F-052, D-356).
// D-722: saiu de lib/api.ts para a feature, sobre o cliente gerado. Os tipos são
// os do contrato — inclusive o `embasamento`, que o backend sempre mandou e o
// tipo à mão (preso num models.ts travado) nunca declarou.

export type YoutubeLivesResponse = Schema<'LivesDoCanalResponse'>;
export type YoutubeLive = YoutubeLivesResponse['lives'][number];
export type EnfileirarDownloadsResponse = Schema<'EnfileirarDownloadsResponse'>;
export type RankingLivesResponse = Schema<'RankingLivesResponse'>;
export type RankingLive = RankingLivesResponse['lives'][number];
export type StatusLiveCandidata = RankingLive['status'];
/** Quanto um critério contribuiu para a pontuação (D-356). */
export type EmbasamentoItem = RankingLive['embasamento'][number];
export type EnfileirarCandidataResponse = Schema<'CandidataEnfileiradaResponse'>;

const daLive = (videoId: string) => ({ params: { path: { video_id: videoId } } });

export const livesApi = {
  listarLivesCanal: (afterDate = '', maxResults = 25) =>
    dados(
      api.GET('/api/youtube/lives', {
        // Sem data, o filtro não vai (o backend entende ausência como "sem corte").
        params: { query: { max_results: maxResults, after_date: afterDate || undefined } },
      }),
    ),

  enfileirarDownloads: (
    videoIds: string[],
    canalOrigem = import.meta.env.VITE_CANAL_HANDLE ?? '@seucanal',
  ) =>
    dados(
      api.POST('/api/youtube/enfileirar', {
        body: { video_ids: videoIds, canal_origem: canalOrigem },
      }),
    ),

  listarRankingLives: (forcarRefresh = false) =>
    dados(
      api.GET('/api/ranking-lives', {
        params: { query: { forcar_refresh: forcarRefresh || undefined } },
      }),
    ),

  refreshRankingLives: () => dados(api.POST('/api/ranking-lives/refresh')),

  rejeitarCandidata: (videoId: string) =>
    dados(api.POST('/api/ranking-lives/{video_id}/rejeitar', daLive(videoId))),

  enfileirarCandidata: (videoId: string) =>
    dados(api.POST('/api/ranking-lives/{video_id}/enfileirar', daLive(videoId))),
};
