import { api, dados, type Schema } from '@/shared/api';
// D-154: cliente HTTP do gerenciador de canais (épico Multi-canal — Opção X).
// D-721: as chamadas passam pelo cliente GERADO do contrato (`shared/api`), e os
// tipos são os do `openapi.json` — antes eram cópias escritas à mão de
// `routers/channels.py`, que divergiam em silêncio quando o backend mudava.

// ─── Contratos (gerados de backend/app/routers/channels.py) ─────────────

export type PaletaCanal = Schema<'PaletaModel'>;
export type Canal = Schema<'CanalResponse'>;
export type ListaCanaisResponse = Schema<'ListaCanaisResponse'>;
/** Campos editáveis da identidade de um canal (merge raso; todos opcionais). */
export type IdentidadeCanal = Schema<'IdentidadeModel'>;
export type CriarCanalRequest = Schema<'CriarCanalRequest'>;
export type SelecionarCanalResponse = Schema<'SelecionarCanalResponse'>;

// ─── Tema de render por canal (D-174) ──────────────────────────────────
// A paleta de render (conjunto COMPLETO de cores das cenas Remotion) é OUTRA
// coisa que a `PaletaCanal` de identidade (3 cores de branding/UI) acima.

export type Tema = Schema<'TemaModel'>;
export type ListaTemasResponse = Schema<'ListaTemasResponse'>;
export type TemaSelecionado = Schema<'TemaSelecionadoResponse'>;

// ─── Conexão OAuth do YouTube por canal (D-169) ────────────────────────

/** Estado da conexão do YouTube do canal ativo (espelha `youtube_auth.status()`). */
export type YoutubeAuthStatus = Schema<'YoutubeAuthStatusResponse'>;
export type YoutubeAuthAcaoResponse = Schema<'YoutubeAuthAcaoResponse'>;

// ─── Endpoints ─────────────────────────────────────────────────────────

const doCanal = (id: string) => ({ params: { path: { canal_id: id } } });

export const channelsApi = {
  listar: () => dados(api.GET('/api/channels')),

  criar: (body: CriarCanalRequest) => dados(api.POST('/api/channels', { body })),

  selecionar: (id: string) => dados(api.POST('/api/channels/{canal_id}/select', doCanal(id))),

  editar: (id: string, body: IdentidadeCanal) =>
    dados(api.PATCH('/api/channels/{canal_id}', { ...doCanal(id), body })),
};

/**
 * Temas de render por canal (D-174). A biblioteca de temas é um default versionado
 * no backend; a SELEÇÃO é por canal (settings.db). Vive em `/api/channels`.
 */
export const themesApi = {
  listar: () => dados(api.GET('/api/channels/temas')),

  obterDoCanal: (id: string) => dados(api.GET('/api/channels/{canal_id}/tema', doCanal(id))),

  selecionar: (id: string, tema_id: string) =>
    dados(api.PUT('/api/channels/{canal_id}/tema', { ...doCanal(id), body: { tema_id } })),
};

/**
 * Conexão OAuth do YouTube (D-169). Opera sempre sobre o canal ATIVO — o backend
 * grava/lê o token na pasta do canal ativo. Vive em `/api/youtube` (router
 * youtube_browser), não em `/api/channels`.
 */
export const youtubeAuthApi = {
  status: () => dados(api.GET('/api/youtube/auth/status')),

  conectar: () => dados(api.POST('/api/youtube/auth/conectar')),

  desconectar: () => dados(api.POST('/api/youtube/auth/desconectar')),
};
