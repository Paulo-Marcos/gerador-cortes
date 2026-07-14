// D-353: cliente HTTP da telemetria de chamadas de IA. Módulo próprio (NUNCA
// `lib/api.ts`, que está sob lock), no mesmo padrão de fetch/erro de
// `rankingPesosApi`. Endpoint sob o router do provider Claude (/api/claude).

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

// ─── Contratos (espelham routers/claude_ia.py, bloco telemetria) ─────────────

/** Uma chamada de IA registrada pela telemetria não-fatal do client Claude. */
export interface LlmCall {
  id: string;
  /** Instante da chamada (ISO-8601 UTC). */
  ts: string;
  /** Rótulo da etapa/skill (ex.: "cortador-expert", "sentimento-ranking"). */
  etapa: string | null;
  model: string | null;
  projeto_id: string | null;
  corte_id: string | null;
  prompt: string | null;
  resposta: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  custo_usd: number | null;
  /** Duração medida pelo servidor do modelo (envelope). */
  duracao_ms_servidor: number | null;
  /** Latência de parede medida no wrapper (subprocess + retries + fila). */
  latencia_ms_wall: number | null;
  sucesso: boolean;
  erro_tipo: string | null;
}

export interface ListaLlmCallsResponse {
  chamadas: LlmCall[];
}

export interface ListarLlmCallsParams {
  projetoId?: string;
  corteId?: string;
  etapa?: string;
  limite?: number;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

function montarQuery(params: ListarLlmCallsParams): string {
  const qs = new URLSearchParams();
  if (params.projetoId) qs.set('projeto_id', params.projetoId);
  if (params.corteId) qs.set('corte_id', params.corteId);
  if (params.etapa) qs.set('etapa', params.etapa);
  if (params.limite != null) qs.set('limite', String(params.limite));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const llmCallsApi = {
  listar: (params: ListarLlmCallsParams = {}) =>
    request<ListaLlmCallsResponse>(`/claude/telemetria/llm-calls${montarQuery(params)}`),
};
