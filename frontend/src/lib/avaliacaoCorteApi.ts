// D-419: cliente HTTP da avaliação de qualidade POR CORTE, colhida quando o
// editor manda gerar o bruto pela 1ª vez. Módulo próprio (não `lib/api.ts`,
// que está sob lock), no mesmo padrão de fetch/erro de `votoQualidadeApi` —
// que é o irmão por LIVE (D-372). Endpoints em routers/avaliacao_cortes.py.

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

/** Ressalva do vocabulário fechado do backend — o front não duplica a lista. */
export interface MotivoAvaliacao {
  slug: string;
  rotulo: string;
}

export interface AvaliacaoCorte {
  corte_id: string;
  /** 1-5; `null` = corte ainda não avaliado. */
  voto: number | null;
  motivos: string[];
  comentario: string;
  avaliado_em: string | null;
}

export interface AvaliacaoCortePayload {
  voto: number;
  motivos: string[];
  comentario: string;
}

export const avaliacaoCorteApi = {
  motivos: () =>
    request<{ motivos: MotivoAvaliacao[] }>('/avaliacao-cortes/motivos').then((r) => r.motivos),

  obter: (corteId: string) => request<AvaliacaoCorte>(`/avaliacao-cortes/corte/${corteId}`),

  salvar: (corteId: string, payload: AvaliacaoCortePayload) =>
    request<AvaliacaoCorte>(`/avaliacao-cortes/corte/${corteId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
