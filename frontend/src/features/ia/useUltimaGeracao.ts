import { useQuery } from '@tanstack/react-query';
import { llmCallsApi } from './api/telemetria';
import type { ProviderIA } from '@/lib/providerIa';

// Quem fez a última geração de uma etapa — a fonte do selo nas telas cujo
// resultado não guarda a origem no próprio registro (metadados, cenas, post,
// gancho, capas). Vem da telemetria de chamadas, que já grava o modelo.
//
// É best-effort de propósito: a telemetria é acessória e pode faltar (banco
// novo, gravação que falhou). Sem registro, a tela fica sem selo — nunca chuta.

export interface UltimaGeracao {
  provider: ProviderIA | null;
  model: string | null;
  ts: string | null;
}

export const ultimaGeracaoKey = (etapa: string, corteId?: string, shortId?: string) =>
  ['ultima-geracao', etapa, corteId ?? '', shortId ?? ''] as const;

export function useUltimaGeracao(
  etapa: string,
  alvo: { corteId?: string; shortId?: string },
  habilitado = true,
) {
  return useQuery({
    queryKey: ultimaGeracaoKey(etapa, alvo.corteId, alvo.shortId),
    queryFn: () => llmCallsApi.ultimaGeracao(etapa, alvo),
    enabled: habilitado && Boolean(alvo.corteId || alvo.shortId),
    // Cada geração invalida a chave; fora isso o dado é estável.
    staleTime: 30_000,
  });
}
