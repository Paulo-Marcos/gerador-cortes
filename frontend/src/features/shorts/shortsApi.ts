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
  /** D-483: o MP4 sem filtro, para julgar antes de gastar a passada boa. */
  arquivo_previa_path: string;
  /** Arranjo escolhido pelo operador. Vazio = automático, deduzido das regiões. */
  modelo_palco: string;
  /** `ia` ou `manual`. O manual sobrevive a uma regeração. */
  origem: string;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

/** A decisão da curadoria: só o que veio é aplicado. */
export interface AtualizarShortBody {
  status?: StatusShort;
  inicio_seg?: number;
  fim_seg?: number;
  foco_x?: number;
  modelo_palco?: string;
}

/** URL do bruto do corte — reusa o redirect com cache-buster de `/cortes`. */
export function brutoUrl(corteId: string): string {
  return `${API_BASE}/cortes/${corteId}/video-bruto`;
}

/** Um arranjo de palco vertical. */
export interface ModeloPalco {
  id: string;
  nome: string;
  porque: string;
  regioes_exigidas: string[];
}

/** De onde saem as regiões deste corte. */
export interface EstadoPalco {
  preset: string;
  origem: 'preset' | 'layout_do_corte' | 'nenhuma';
  regioes: Record<string, { x: number; y: number; w: number; h: number }>;
  modelo_sugerido: string;
  presets_disponiveis: { id: string; nome: string; regioes: string[] }[];
}

/** Um retângulo em pixels. */
export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Um recorte em coordenadas de desenho: de onde tirar, onde colar, onde cortar. */
export interface RecorteDesenhavel {
  origem: Retangulo;
  destino: Retangulo;
  recorta: Retangulo;
}

/** O palco de um short, pronto para o canvas. Calculado no backend. */
export interface PlanoDesenhavel {
  origem: 'preset' | 'layout_do_corte' | 'nenhuma';
  modelo: string | null;
  canvas: { largura: number; altura: number };
  fundo: string;
  recortes: RecorteDesenhavel[];
}

/** Um passo do render e onde ele está. */
export interface PassoRender {
  chave: string;
  label: string;
  status: 'pendente' | 'rodando' | 'concluido' | 'erro';
}

/** O render em curso (ou o último deste processo). */
export interface ProgressoRender {
  estagio: 'previa' | 'final';
  concluido: boolean;
  erro: string | null;
  decorrido_seg: number;
  passos: PassoRender[];
}

/** URL do MP4 do short. `estagio` escolhe entre o rascunho e o que vai publicar. */
export function shortVideoUrl(shortId: string, estagio: 'previa' | 'final'): string {
  return `${API_BASE}/shorts/${shortId}/video?estagio=${estagio}`;
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

  criarManual: (corteId: string, body: { inicio_seg: number; fim_seg: number; titulo?: string }) =>
    request<{ short: ShortSugerido }>(`/shorts/corte/${corteId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listarDoCorte: (corteId: string) =>
    request<{ shorts: ShortSugerido[] }>(`/shorts/corte/${corteId}`),

  modelosDePalco: () => request<{ modelos: ModeloPalco[] }>('/shorts/palco/modelos'),

  palcoDoCorte: (corteId: string) => request<EstadoPalco>(`/shorts/corte/${corteId}/palco`),

  escolherPreset: (corteId: string, presetId: string) =>
    request<EstadoPalco>(`/shorts/corte/${corteId}/palco`, {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId }),
    }),

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

  // D-485: os dois disparam e voltam na hora. Quem acompanha e o progresso.
  renderizarPrevia: (shortId: string) =>
    request<{ status: string; estagio: string }>(`/shorts/${shortId}/previa`, {
      method: 'POST',
    }),

  palcoDoShort: (shortId: string) =>
    request<PlanoDesenhavel>(`/shorts/${shortId}/palco`),

  progresso: (shortId: string) =>
    request<{ render: ProgressoRender | null }>(`/shorts/${shortId}/progresso`),

  renderizar: (shortId: string) =>
    request<{ status: string; estagio: string }>(`/shorts/${shortId}/renderizar`, {
      method: 'POST',
    }),

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
