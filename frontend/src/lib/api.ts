import type {
  FilaGlobal,
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
