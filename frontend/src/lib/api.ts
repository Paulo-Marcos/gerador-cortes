import type {
  CenaRemotion,
  CenasRemotionPayload,
  Corte,
  FilaGlobal,
  PipelineStatusResponse,
  RemotionStudioUrlResponse,
  StatusBrutoResponse,
  WaveformPeaksResponse,
} from '@/types/models';
import { API_BASE, VIDEOS_BASE, wsUrl } from '@/lib/apiBase';


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// D-160 — opt-ins da regeração do bruto. Só valem quando o corte já tem bruto
// (regeração); na 1ª geração o backend força a cadeia completa.
export interface GerarBrutoOpcoes {
  refazer_transcricao?: boolean;
  refazer_cenas?: boolean;
}

export const api = {
  // I-023: filtro padrão de render vive só em Ajustes (PUT /settings).
  // O antigo PATCH /export/projeto/{id}/filtro-padrao foi removido — não
  // existia "filtro por projeto" coerente com a fonte única definida em
  // AppSettings.filtro_global_padrao.

  filaGlobal: () => request<FilaGlobal>('/export/fila-global'),

  /** D-426: interrompe um job da fila global sem derrubar a aplicação. */
  cancelarJob: (jobId: string) =>
    request<{ job_id: string; cancelado: boolean; jobs_worker_avisados: number }>(
      '/export/fila-global/cancelar',
      { method: 'POST', body: JSON.stringify({ job_id: jobId }) },
    ),

  // ─── Cortes (editor) ───────────────────────────────────────────────
  // Geração de vídeo bruto (cortar com ffmpeg, removendo TODOS os desvios).
  // Dispara assíncrono; acompanhe progresso por statusClipBruto.
  // D-160 — na regeração (corte já com bruto) o default é só o bruto; passe
  // os opt-ins para também refazer transcrição/cenas. Na 1ª geração o backend
  // força a cadeia completa e ignora estes flags.
  cortarClipBruto: (corteId: string, opts?: GerarBrutoOpcoes) =>
    request<{ message: string; corte_id: string }>(`/cortes/${corteId}/gerar-bruto`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),

  statusClipBruto: (corteId: string) =>
    request<StatusBrutoResponse>(`/export/corte/${corteId}/cortar/status`),

  // F-038 — passos do gerar/regerar bruto (para o dropdown de acompanhamento).
  brutoProgress: (corteId: string) =>
    request<{ passos: { chave: string; label: string; status: string }[] }>(
      `/cortes/${corteId}/bruto-progress`,
    ),

  obterWaveformPeaks: (corteId: string, refresh = false) =>
    request<WaveformPeaksResponse>(
      `/cortes/${corteId}/waveform-peaks${refresh ? '?refresh=true' : ''}`,
    ),

  renderizarRemotion: (
    corteId: string,
    options: {
      startFrom?: 'auto' | 'grade' | 'overlays' | 'overlays_continuar' | 'render_final';
      // D-064: render granular — para após esta fase (parcial, não finaliza o
      // corte). Omitido = roda até o render final.
      pararEm?: 'grade' | 'overlays' | 'render_final';
      // D-064: quando informado explicitamente, controla o reaproveitamento de
      // overlays (continuar vs. refazer do zero). Quando ausente, é derivado do
      // `startFrom` (comportamento legado).
      continuar?: boolean;
      filtro?: string;
    } = {},
  ) => {
    const startFromUi = options.startFrom ?? 'auto';
    const isContinuarFase2 = startFromUi === 'overlays_continuar';
    // I-023: NUNCA enviar fallback hardcoded de filtro. Quando o caller não
    // especifica um filtro de teste, o backend resolve `filtro=null` para
    // `AppSettings.filtro_global_padrao` (fonte única configurada em Ajustes).
    // O bug anterior ("renderiza sempre cinematic_iii completo") era exatamente
    // este fallback aqui passando `'cinematic_iii'` por cima do global.
    const payload: {
      filtro?: string;
      continuar: boolean;
      start_from: string;
      parar_em?: string;
    } = {
      continuar: options.continuar ?? (startFromUi === 'auto' || isContinuarFase2),
      start_from: isContinuarFase2 ? 'overlays' : startFromUi,
    };
    if (options.pararEm) payload.parar_em = options.pararEm;
    if (options.filtro) payload.filtro = options.filtro;
    return request<{ message: string }>(`/cortes/${corteId}/renderizar-pipeline`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  obterPipelineStatus: (corteId: string) =>
    request<PipelineStatusResponse>(`/cortes/${corteId}/pipeline-status`),

  obterRemotionStudioUrl: (corteId: string) =>
    request<RemotionStudioUrlResponse>(`/cortes/${corteId}/remotion-studio-url`),

  obterCaminhoPasta: (corteId: string) =>
    request<{ dir_path: string }>(`/cortes/${corteId}/caminho-pasta`),

  // ─── Cenas Remotion ────────────────────────────────────────────────
  gerarCenasRemotion: (corteId: string) =>
    request<CenasRemotionPayload | { cenas: CenaRemotion[] }>(
      `/cortes/${corteId}/gerar-cenas-remotion`,
      { method: 'POST', body: '{}' },
    ),

  importarCenasRemotion: (corteId: string, payload: CenasRemotionPayload) =>
    request<{ message: string }>(`/cortes/${corteId}/cenas-remotion/importar`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  validarCenasRemotion: (corteId: string, validado = true) =>
    request<Corte>(`/cortes/${corteId}/cenas-remotion/validar`, {
      method: 'POST',
      body: JSON.stringify({ validado }),
    }),

  obterPromptCenasRemotion: (corteId: string) =>
    request<{
      prompt: string;
      prompts: { parte: number; total_partes: number; texto: string }[];
      formato_esperado?: unknown;
    }>(`/cortes/${corteId}/cenas-remotion/prompt`),

};

export { VIDEOS_BASE };

const CAMINHO_ABSOLUTO_RE = /^[a-zA-Z]:\//;

/** Resolve URL absoluta a partir de thumbnail_path (relativo ou absoluto). */
export function resolveThumbUrl(projetoId: string, thumbPath?: string | null): string | null {
  if (!thumbPath) return null;
  if (/^https?:\/\//i.test(thumbPath)) return thumbPath;
  // backend serve estático em /videos/{projetoId}/...
  let clean = thumbPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');

  // path absoluto (formato antigo ou novo pós-split) contendo o diretório do
  // projeto no meio do caminho: extrai só o sub-caminho relativo a ele.
  const marker = `/${projetoId}/`;
  const markerIndex = clean.indexOf(marker);
  if (markerIndex !== -1) {
    clean = clean.slice(markerIndex + marker.length);
  } else if (clean.startsWith(`${projetoId}/`)) {
    clean = clean.slice(projetoId.length + 1);
  }

  // fallback de segurança: nunca deixar um prefixo absoluto (drive/usuário)
  // vazar na URL final — se o id não foi localizado, ancora em 'thumbnails/'.
  if (CAMINHO_ABSOLUTO_RE.test(clean)) {
    const thumbIndex = clean.toLowerCase().indexOf('thumbnails/');
    clean = thumbIndex !== -1 ? clean.slice(thumbIndex) : (clean.split('/').pop() ?? clean);
  }

  return `${VIDEOS_BASE}/${projetoId}/${clean}`;
}

export function finalVideoUrl(projetoId: string, corteId: string): string {
  return `${VIDEOS_BASE}/${projetoId}/cortes/${corteId}/upload_ready/video.mp4`;
}

export function gradedVideoUrl(projetoId: string, corteId: string): string {
  return `${VIDEOS_BASE}/${projetoId}/cortes/${corteId}/graded/clip_graded.mp4`;
}

export function versaoVideoUrl(
  projetoId: string,
  corteId: string,
  filtro: string,
  preview: boolean,
): string {
  const arquivo = preview ? 'preview.mp4' : 'video.mp4';
  return `${VIDEOS_BASE}/${projetoId}/cortes/${corteId}/versoes/${filtro}/${arquivo}`;
}

export function rawVideoRedirectUrl(corteId: string): string {
  return `${API_BASE}/cortes/${corteId}/video-bruto`;
}

/**
 * Variante do `rawVideoRedirectUrl` com cache-buster.  Necessária porque o
 * navegador segura o video file em memória/disco mesmo após hard-refresh
 * em alguns casos (HTML5 video element + cache de redirect).  Passe um
 * `bustKey` que mude quando você quer forçar reload (timestamp da última
 * geração, ex.: Date.now() após status `pronto`).
 */
export function rawVideoBustedUrl(corteId: string, bustKey: number | string): string {
  return `${rawVideoRedirectUrl(corteId)}?v=${bustKey}`;
}

export function audioProxyUrl(corteId: string, refresh = false): string {
  const params = refresh ? '?refresh=true' : '';
  return `${API_BASE}/cortes/${corteId}/audio-proxy${params}`;
}

export function waveformPeaksUrl(corteId: string, refresh = false): string {
  const params = refresh ? '?refresh=true' : '';
  return `${API_BASE}/cortes/${corteId}/waveform-peaks${params}`;
}

/**
 * Busca os peaks de waveform de uma URL ja montada (via `waveformPeaksUrl`).
 * Helper proprio — e nao o `request` generico — porque os callers (timeline
 * da Bruta e do Pos) passam a URL pronta como prop/param e tratam o erro com
 * fallback proprio (carregar audio sem peaks). Centraliza o padrao cru de
 * fetch+ok-check+json para os componentes ficarem burros.
 */
export async function fetchWaveformPeaks(url: string): Promise<WaveformPeaksResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`waveform-peaks ${res.status}`);
  return (await res.json()) as WaveformPeaksResponse;
}

export function progressoWsUrl(projetoId: string): string {
  return wsUrl(`/projetos/${projetoId}/ws`);
}
