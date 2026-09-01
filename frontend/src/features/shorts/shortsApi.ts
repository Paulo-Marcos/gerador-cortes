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
  /** Ajuste do operador (null = ainda seguindo o layout do corte). */
  foco_x: number | null;
  /** O enquadramento que o render vai usar de fato: ajuste ou layout. */
  foco_efetivo: number;
  arquivo_short_path: string;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

/** A decisão da curadoria: só o que veio é aplicado. */
export interface AtualizarShortBody {
  status?: StatusShort;
  inicio_seg?: number;
  fim_seg?: number;
  foco_x?: number;
}

/** URL do bruto do corte — reusa o redirect com cache-buster de `/cortes`. */
export function brutoUrl(corteId: string): string {
  return `${API_BASE}/cortes/${corteId}/video-bruto`;
}

export interface PacotePublicacao {
  plataforma: string;
  rotulo: string;
  modo: 'api' | 'manual';
  titulo: string;
  titulo_visivel: string;
  descricao: string;
  hashtags: string[];
  avisos: string[];
}

/** Uma palavra com tempo, na timeline do BRUTO. */
export interface PalavraTranscrita {
  texto: string;
  inicio_seg: number;
  fim_seg: number;
}

/** As palavras do bruto + de onde vieram (`auto_legenda` ou `asr_local`). */
export interface TranscricaoDoBruto {
  fonte: string;
  palavras: PalavraTranscrita[];
}

/** O que a tela do bruto precisa saber para oferecer (ou nao) a fabrica. */
export interface ElegibilidadeShorts {
  is_fire: boolean;
  tem_bruto: boolean;
  total_shorts: number;
}

export const shortsApi = {
  listarFires: () => request<{ fires: FireComBruto[] }>('/shorts/fires'),

  elegibilidade: (corteId: string) =>
    request<ElegibilidadeShorts>(`/shorts/corte/${corteId}/elegibilidade`),

  gerarManualmente: (corteId: string) =>
    request<{ shorts: ShortSugerido[]; descartes: string[]; bruto_regerado: boolean }>(
      `/shorts/corte/${corteId}/gerar`,
      { method: 'POST' },
    ),

  listarDoCorte: (corteId: string) =>
    request<{ shorts: ShortSugerido[] }>(`/shorts/corte/${corteId}`),

  transcricaoDoCorte: (corteId: string) =>
    request<TranscricaoDoBruto>(`/shorts/corte/${corteId}/transcricao`),

  atualizar: (shortId: string, body: AtualizarShortBody) =>
    request<{ short: ShortSugerido }>(`/shorts/${shortId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  descartarBruto: (corteId: string) =>
    request<{ liberado_mb: number; removidos: string[]; erros: string[] }>(
      `/shorts/corte/${corteId}/bruto`,
      { method: 'DELETE' },
    ),

  renderizar: (shortId: string) =>
    request<{ arquivo_short_path: string; fonte_legenda: string; palavras: number }>(
      `/shorts/${shortId}/renderizar`,
      { method: 'POST' },
    ),

  previaPublicacao: (shortId: string) =>
    request<{ pacotes: PacotePublicacao[] }>(`/shorts/${shortId}/publicacao`),

  publicar: (shortId: string, plataforma: string) =>
    request<Record<string, unknown>>(`/shorts/${shortId}/publicar/${plataforma}`, {
      method: 'POST',
    }),

  sugerirAgora: (corteId: string) =>
    request<{ shorts: ShortSugerido[]; descartes: string[] }>(
      `/shorts/corte/${corteId}/sugerir`,
      { method: 'POST' },
    ),
};
