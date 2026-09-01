// D-458: cliente HTTP da fábrica de shorts. Módulo próprio (NUNCA `lib/api.ts`,
// que está sob quatro locks sem relação com shorts), no mesmo padrão de
// `llmCallsApi`/`rankingPesosApi`. Aqui não há duplicação a temer: nenhuma
// função de shorts existe em `api.ts`, então nada fica órfão lá.

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

// ─── Contratos (espelham routers/shorts.py) ────────────────────────────────

export type StatusShort = 'sugerido' | 'aprovado' | 'rejeitado' | 'renderizado';

/** Quantos shorts o Fire tem, por estágio da curadoria. */
export interface ContagemShorts {
  total: number;
  sugerido: number;
  aprovado: number;
  rejeitado: number;
  renderizado: number;
}

/** Um corte Fire cujo bruto AINDA está em disco — só esses têm de onde recortar. */
export interface FireComBruto {
  corte_id: string;
  projeto_id: string;
  projeto_titulo: string;
  numero: number;
  titulo: string;
  tema_central: string;
  duracao_seg: number;
  bruto_mb: number;
  shorts: ContagemShorts;
}

export interface ShortSugerido {
  id: string;
  corte_id: string;
  numero: number;
  titulo: string;
  gancho: string;
  inicio_seg: number;
  fim_seg: number;
  duracao_seg: number;
  score: number;
  justificativa: string;
  status: StatusShort;
  arquivo_short_path: string;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

export const shortsApi = {
  listarFires: () => request<{ fires: FireComBruto[] }>('/shorts/fires'),

  listarDoCorte: (corteId: string) =>
    request<{ shorts: ShortSugerido[] }>(`/shorts/corte/${corteId}`),

  sugerirAgora: (corteId: string) =>
    request<{ shorts: ShortSugerido[]; descartes: string[] }>(
      `/shorts/corte/${corteId}/sugerir`,
      { method: 'POST' },
    ),
};
