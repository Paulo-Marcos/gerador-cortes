import type { WaveformPeaksResponse } from '@/types/models';
import { API_BASE, VIDEOS_BASE } from '@/lib/apiBase';

// D-722: os clientes da API saíram daqui para as features (e a fila global para
// shared/), sobre o cliente gerado. O que fica são as URLs que a tela monta para
// <video>, <img> e <audio>, e a leitura dos picos da waveform por uma URL já
// montada — nada disso passa pelo cliente HTTP. O WebSocket de progresso mora
// em shared/api/realtime (D-724).

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
