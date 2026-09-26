import { API_BASE } from '@/lib/apiBase';
import { api, dados, type Schema } from '@/shared/api';

// E-022: a Área de Análises — telemetria proposta×final (D-303) e desempenho no
// YouTube (D-305). D-722: saiu de lib/api.ts para a feature, sobre o cliente
// gerado; os tipos são os do contrato, que o backend passou a declarar.

export type TelemetriaProjeto = Schema<'TelemetriaProjetoResponse'>;
export type TelemetriaCorteDiff = TelemetriaProjeto['cortes'][number];
/** Situação do corte na telemetria (domain/corte/telemetria_cortes.py). */
export type TelemetriaSituacao = TelemetriaCorteDiff['situacao'];
export type YoutubeStatsStatus = Schema<'YoutubeStatsStatusResponse'>;
export type YoutubeVideoStat = YoutubeStatsStatus['videos'][number];
export type LevantamentoDuracao = Schema<'LevantamentoDuracao'>;
export type LevantamentoTitulo = Schema<'LevantamentoTitulo'>;
/** `iniciado` = sync disparada; `erro` + `precisa_reautorizar` = falta escopo OAuth. */
export type YoutubeStatsSyncResult = Schema<'YoutubeStatsSyncResponse'>;

export const analisesApi = {
  obterTelemetriaCortes: (projetoId: string) =>
    dados(
      api.GET('/api/projetos/{projeto_id}/telemetria-cortes', {
        params: { path: { projeto_id: projetoId } },
      }),
    ),

  /** O CSV é baixado pelo navegador, então é uma URL e não uma chamada. */
  telemetriaCortesCsvUrl: () => `${API_BASE}/projetos/telemetria-cortes/export?formato=csv`,

  obterYoutubeStatsStatus: () => dados(api.GET('/api/projetos/youtube-stats/status')),

  levantamentoDuracaoRetencao: () =>
    dados(api.GET('/api/projetos/youtube-stats/levantamento/duracao-retencao')),

  levantamentoTituloDesempenho: () =>
    dados(api.GET('/api/projetos/youtube-stats/levantamento/titulo-desempenho')),

  sincronizarYoutubeStats: () => dados(api.POST('/api/projetos/youtube-stats/sync')),
};
