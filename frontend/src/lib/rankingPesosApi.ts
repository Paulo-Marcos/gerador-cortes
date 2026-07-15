// D-351: cliente HTTP da gestão dos pesos e critérios do ranking de lives por
// canal. Módulo próprio (não `lib/api.ts`, que está sob lock), no mesmo padrão de
// fetch/erro de `promptsUtilitariosApi`. Endpoints irmãos sob /editorial-skills.

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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─── Contratos (espelham routers/editorial_skills.py, bloco ranking-pesos) ───

/** Um critério do ranking: rótulo/descrição + valor-do-canal + default (reset). */
export interface CriterioRanking {
  key: string;
  /** Nome claro do critério (ex.: "Tom do público (sentimento…)"). */
  rotulo: string;
  /** Explicação do que o critério significa e como pesa no ranking. */
  descricao: string;
  /** True para os 5 pesos; false para a meia-vida (parâmetro do decay). */
  eh_peso: boolean;
  valor: number;
  valor_default: number;
}

export interface ListaRankingPesosResponse {
  criterios: CriterioRanking[];
}

/** Payload de edição: todos os critérios de uma vez (o reescalonamento é do conjunto). */
export interface RankingPesosPayload {
  views: number;
  likes_por_view: number;
  comentarios_por_view: number;
  sentimento: number;
  recencia: number;
  vph: number;
  meia_vida_dias: number;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

export const rankingPesosApi = {
  listar: () => request<ListaRankingPesosResponse>('/editorial-skills/ranking-pesos'),

  salvar: (valores: RankingPesosPayload) =>
    request<ListaRankingPesosResponse>('/editorial-skills/ranking-pesos', {
      method: 'PUT',
      body: JSON.stringify(valores),
    }),

  // GET (não POST): reset é idempotente e sem corpo; POST sem body disparava 422.
  resetar: () =>
    request<ListaRankingPesosResponse>('/editorial-skills/ranking-pesos/reset', {
      method: 'GET',
    }),
};
