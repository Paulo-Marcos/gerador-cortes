import { api, dados, type Schema } from '@/shared/api';
// D-353: cliente HTTP da telemetria de chamadas de IA. Endpoint sob o router do
// provider Claude (/api/claude). D-722: pelo cliente gerado do contrato.

/** Uma chamada de IA registrada pela telemetria não-fatal dos clientes de IA. */
export type LlmCall = Schema<'LlmCallResponse'>;
export type ListaLlmCallsResponse = Schema<'ListaLlmCallsResponse'>;
/** Quem fez a última geração de uma etapa — a fonte do selo Claude/Gemini. */
export type UltimaGeracaoResponse = Schema<'UltimaGeracaoResponse'>;

export interface ListarLlmCallsParams {
  projetoId?: string;
  corteId?: string;
  shortId?: string;
  etapa?: string;
  limite?: number;
}

// Filtro vazio não vai na query: '' seria "etapa igual a vazio", não "qualquer".
const ouNada = (valor?: string) => valor || undefined;

export const llmCallsApi = {
  listar: (params: ListarLlmCallsParams = {}) =>
    dados(
      api.GET('/api/claude/telemetria/llm-calls', {
        params: {
          query: {
            projeto_id: ouNada(params.projetoId),
            corte_id: ouNada(params.corteId),
            short_id: ouNada(params.shortId),
            etapa: ouNada(params.etapa),
            limite: params.limite,
          },
        },
      }),
    ),

  ultimaGeracao: (etapa: string, alvo: { corteId?: string; shortId?: string } = {}) =>
    dados(
      api.GET('/api/claude/telemetria/ultima-geracao', {
        params: {
          query: { etapa, corte_id: ouNada(alvo.corteId), short_id: ouNada(alvo.shortId) },
        },
      }),
    ),
};
