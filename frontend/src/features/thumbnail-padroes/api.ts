import type { ProviderIA } from '@/lib/providerIa';
import { api, dados, type Schema } from '@/shared/api';

// D-070: análise de padrões dos melhores prompts de thumbnail avaliados.
// D-722: saiu de lib/api.ts para a feature, sobre o cliente gerado. A leitura do
// agente chega normalizada pelo domínio — antes era o JSON cru da IA, e uma
// resposta sem `padroes` derrubava a página.

export type PadroesThumbnailResponse = Schema<'PadroesThumbnailResponse'>;
export type PadroesCompilados = Schema<'PadroesCompilados'>;
export type PadroaoEixoOcorrencia = Schema<'OcorrenciaDoEixo'>;
export type AnalisePadroesAgente = Schema<'AnalisePadroesAgente'>;

export const padroesThumbnailApi = {
  analisar: (provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/avaliacoes-thumbnail/padroes', { params: { query: { provider } } })),
};
