import { API_BASE } from '@/lib/apiBase';
// D-372: cliente HTTP do voto manual (1-5) de qualidade da live. Módulo próprio
// (não `lib/api.ts`, que está sob lock), no mesmo padrão de fetch/erro de
// `rankingPesosApi`. Endpoint irmão em routers/ranking_lives.py.


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

export interface VotoQualidadeResponse {
  projeto_id: string;
  voto_qualidade_live: number | null;
  pontuacao_ranking: number;
}

export const votoQualidadeApi = {
  obter: (projetoId: string) =>
    request<VotoQualidadeResponse>(`/ranking-lives/projetos/${projetoId}/voto-qualidade`),

  salvar: (projetoId: string, voto: number) =>
    request<VotoQualidadeResponse>(`/ranking-lives/projetos/${projetoId}/voto-qualidade`, {
      method: 'PUT',
      body: JSON.stringify({ voto }),
    }),
};
