// D-447: cliente HTTP da avaliação automática da ESTRUTURA do bruto — a nota
// que a IA dá depois de ler o que sobrou com as emendas marcadas. Módulo
// próprio (não `lib/api.ts`, que está sob lock), no mesmo padrão de fetch/erro
// de `avaliacaoCorteApi` — que é o irmão HUMANO por corte (D-419).
// Endpoints em routers/avaliacao_bruto.py.

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

/** Tipo de defeito do vocabulário fechado do backend — o front não duplica a lista. */
export interface TipoApontamento {
  slug: string;
  rotulo: string;
}

export type VereditoBruto = 'coesa' | 'aceitavel' | 'quebrada';
export type GravidadeApontamento = 'leve' | 'media' | 'grave';

export interface ApontamentoBruto {
  tipo: string;
  /** Rótulo legível já resolvido pelo backend. */
  rotulo: string;
  gravidade: GravidadeApontamento;
  /** `MM:SS` na timeline do bruto, ou vazio quando o modelo não situou. */
  momento: string;
  descricao: string;
}

export interface AvaliacaoBruto {
  id: string;
  corte_id: string;
  projeto_id: string;
  /** 1-5, mesma escala do voto humano (D-419) — de propósito, para cruzar. */
  nota: number;
  veredito: VereditoBruto;
  parecer: string;
  apontamentos: ApontamentoBruto[];
  duracao_seg: number;
  duracao_hms: string;
  total_emendas: number;
  removido_seg: number;
  modelo: string;
  criado_em: string | null;
}

export const avaliacaoBrutoApi = {
  tipos: () =>
    request<{ tipos: TipoApontamento[] }>('/avaliacao-bruto/tipos').then((r) => r.tipos),

  /** Última avaliação do corte; `null` = nunca avaliado. */
  obter: (corteId: string) =>
    request<{ avaliacao: AvaliacaoBruto | null }>(`/avaliacao-bruto/corte/${corteId}`).then(
      (r) => r.avaliacao,
    ),

  /** A série completa do corte, da mais recente para a mais antiga. */
  historico: (corteId: string) =>
    request<{ avaliacoes: AvaliacaoBruto[] }>(
      `/avaliacao-bruto/corte/${corteId}/historico`,
    ).then((r) => r.avaliacoes),

  /** A última avaliação de cada corte da live. */
  doProjeto: (projetoId: string) =>
    request<{ avaliacoes: AvaliacaoBruto[] }>(`/avaliacao-bruto/projeto/${projetoId}`).then(
      (r) => r.avaliacoes,
    ),

  /** Reavalia o bruto atual sem regerar o vídeo (o normal é rodar sozinha). */
  reavaliar: (corteId: string) =>
    request<{ avaliacao: AvaliacaoBruto }>(`/avaliacao-bruto/corte/${corteId}`, {
      method: 'POST',
    }).then((r) => r.avaliacao),
};
