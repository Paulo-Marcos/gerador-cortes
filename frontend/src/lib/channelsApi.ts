// D-154: cliente HTTP do gerenciador de canais (épico Multi-canal — Opção X).
// Módulo próprio (e não `lib/api.ts`, que está sob lock) para as chamadas da
// API de canais criada em D-153. Segue o mesmo padrão de fetch/erro do projeto:
// checa `res.ok`, propaga status + corpo no erro e desserializa JSON.

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

// ─── Contratos (espelham backend/app/routers/channels.py) ──────────────

export interface PaletaCanal {
  primaria: string;
  secundaria: string;
  acento: string;
}

export interface Canal {
  id: string;
  handle: string;
  nome: string;
  credito: string;
  /** Canal-fonte das lives no YouTube (@handle ou id UCxxxx). */
  youtube_channel_id: string;
  paleta: PaletaCanal;
  ativo: boolean;
}

export interface ListaCanaisResponse {
  canais: Canal[];
  /** Id do canal ativo (null se ainda não há ponteiro válido). */
  ativo: string | null;
}

/** Campos editáveis da identidade de um canal (merge raso; todos opcionais). */
export interface IdentidadeCanal {
  handle?: string;
  nome?: string;
  credito?: string;
  youtube_channel_id?: string;
  paleta?: PaletaCanal;
}

export interface CriarCanalRequest extends IdentidadeCanal {
  /** Id (slug) do canal — vira o nome da pasta. */
  id: string;
}

export interface SelecionarCanalResponse {
  canal_id: string;
  /** Quando true, a troca só efetiva após reiniciar o backend. */
  requer_restart: boolean;
}

// ─── Conexão OAuth do YouTube por canal (D-169) ────────────────────────

/** Estado da conexão do YouTube do canal ativo (espelha `youtube_auth.status()`). */
export interface YoutubeAuthStatus {
  /** Há um token válido para o canal ativo. */
  conectado: boolean;
  /** Título do canal do YouTube autenticado (vazio quando desconectado). */
  canal_titulo: string;
  /** O `client_secrets.json` (crachá do app) existe — pré-requisito do login. */
  cliente_configurado: boolean;
  /** Um login está em andamento (a UI deve continuar pollando). */
  fluxo_em_andamento: boolean;
  /** Mensagem do último erro de login, se houver. */
  erro: string | null;
}

export interface YoutubeAuthAcaoResponse {
  status: string;
  mensagem: string;
}

// ─── Endpoints ─────────────────────────────────────────────────────────

export const channelsApi = {
  listar: () => request<ListaCanaisResponse>('/channels'),

  criar: (body: CriarCanalRequest) =>
    request<Canal>('/channels', { method: 'POST', body: JSON.stringify(body) }),

  selecionar: (id: string) =>
    request<SelecionarCanalResponse>(`/channels/${encodeURIComponent(id)}/select`, {
      method: 'POST',
      body: '{}',
    }),

  editar: (id: string, body: IdentidadeCanal) =>
    request<Canal>(`/channels/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

/**
 * Conexão OAuth do YouTube (D-169). Opera sempre sobre o canal ATIVO — o backend
 * grava/lê o token na pasta do canal ativo. Vive em `/api/youtube` (router
 * youtube_browser), não em `/api/channels`.
 */
export const youtubeAuthApi = {
  status: () => request<YoutubeAuthStatus>('/youtube/auth/status'),

  conectar: () =>
    request<YoutubeAuthAcaoResponse>('/youtube/auth/conectar', { method: 'POST', body: '{}' }),

  desconectar: () =>
    request<YoutubeAuthAcaoResponse>('/youtube/auth/desconectar', { method: 'POST', body: '{}' }),
};
