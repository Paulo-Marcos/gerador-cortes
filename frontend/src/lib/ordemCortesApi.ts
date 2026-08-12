// D-448: cliente HTTP do desvio EXPLÍCITO da ordem cronológica dos cortes.
// A ordem padrão (por tempo) não tem endpoint: o backend a recalcula a cada
// operação que cria ou move corte. O que existe aqui é o pin — e o desfazer
// dele. Módulo próprio (não `lib/api.ts`, sob lock), mesmo padrão de
// `avaliacaoCorteApi`. Endpoints em routers/ordem_cortes.py.

import type { Corte } from '@/types/models';

/** `Corte` + o pin do D-448. Extensão local porque `types/models.ts` está sob
 *  lock; o backend já devolve o campo em toda rota de corte. */
export type CorteComPin = Corte & { posicao_fixada?: number | null };

/** Um corte está fora da ordem cronológica só quando foi fixado na mão. */
export function estaFixado(corte: CorteComPin): boolean {
  return corte.posicao_fixada != null;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  return (await res.json()) as T;
}

export const ordemCortesApi = {
  /** Solta todos os pins da live e devolve a lista à ordem do tempo. */
  normalizar: (projetoId: string) =>
    request<CorteComPin[]>(`/ordem-cortes/projeto/${projetoId}/normalizar`, { method: 'POST' }),

  /** Fixa o corte numa posição (1-based); `null` solta e devolve ao tempo. */
  fixarPosicao: (corteId: string, posicao: number | null) =>
    request<CorteComPin[]>(`/ordem-cortes/corte/${corteId}/posicao`, {
      method: 'PUT',
      body: JSON.stringify({ posicao }),
    }),
};
