import type { Corte, StatusExportCorte, CenaRemotion, CenasRemotionPayload } from '@/types/models';

export function finalReviewPath(projetoId: string, corteId: string): string {
  return `/projetos/${projetoId}/final-review?corte=${corteId}`;
}

export function rawEditorPath(projetoId: string, corteId: string): string {
  return `/projetos/${projetoId}/cortes/${corteId}?fase=1`;
}

export function postProductionPath(
  projetoId: string,
  corteId: string,
  forcePhase2 = false,
): string {
  return `/projetos/${projetoId}/post-production?corte=${corteId}${forcePhase2 ? '&fase=2' : ''}`;
}

export function resolveRenderCompletionPath(params: {
  projetoId: string;
  corteId?: string;
  finished: boolean;
}): string | null {
  if (!params.corteId || !params.finished) return null;
  return finalReviewPath(params.projetoId, params.corteId);
}

export function isCorteVideoPronto(
  corte: Pick<Corte, 'id' | 'is_pos_producao'>,
  status: StatusExportCorte | undefined,
): boolean {
  // is_pos_producao do próprio corte é canônico: o backend só seta = 1 quando
  // upload_ready/video.mp4 existe (e ainda atualiza heuristicamente em getCorte
  // pra cortes legados). O exportStatus só lista APROVADO/EDITADO/PROCESSADO,
  // então sozinho falha pra cortes em outros status que mesmo assim foram
  // renderizados/publicados.
  return Boolean(status?.video_pronto || corte.is_pos_producao === 1);
}

function isCorteRawPronto(
  corte: Pick<Corte, 'arquivo_clip_path'>,
  status: StatusExportCorte | undefined,
): boolean {
  return Boolean(
    status?.raw_pronto ||
      status?.grade_pronta ||
      status?.overlays_prontos ||
      status?.video_pronto ||
      corte.arquivo_clip_path,
  );
}

export function resolveCorteStagePath(params: {
  projetoId: string;
  corte: Pick<Corte, 'id' | 'arquivo_clip_path' | 'is_pos_producao'>;
  status?: StatusExportCorte;
  forcePhase2?: boolean;
}): string {
  if (isCorteVideoPronto(params.corte, params.status)) {
    return finalReviewPath(params.projetoId, params.corte.id);
  }

  if (isCorteRawPronto(params.corte, params.status)) {
    return postProductionPath(params.projetoId, params.corte.id, params.forcePhase2);
  }

  return rawEditorPath(params.projetoId, params.corte.id);
}

export function pickPostProductionEntryCut(
  cortes: Corte[],
  statuses: StatusExportCorte[] | undefined,
): Corte | undefined {
  const statusMap = new Map((statuses ?? []).map((status) => [status.corte_id, status] as const));
  return (
    cortes.find((corte) => isCorteVideoPronto(corte, statusMap.get(corte.id))) ??
    cortes.find(
      (corte) => statusMap.get(corte.id)?.raw_pronto || Boolean(corte.arquivo_clip_path),
    ) ??
    cortes[0]
  );
}

export function isCenaRemotion(value: unknown): value is CenaRemotion {
  if (!value || typeof value !== 'object') return false;
  const cena = value as Partial<CenaRemotion>;
  return (
    typeof cena.tipo === 'string' && typeof cena.inicio === 'number' && typeof cena.fim === 'number'
  );
}

export function parseCenasPayload(raw: unknown): CenasRemotionPayload {
  if (Array.isArray(raw)) return { cenas: raw.filter(isCenaRemotion) };

  if (raw && typeof raw === 'object') {
    const payload = raw as Partial<CenasRemotionPayload>;
    return {
      formato: typeof payload.formato === 'string' ? payload.formato : undefined,
      paleta: payload.paleta && typeof payload.paleta === 'object' ? payload.paleta : undefined,
      cenas: Array.isArray(payload.cenas) ? payload.cenas.filter(isCenaRemotion) : [],
    };
  }

  return { cenas: [] };
}

export function progressFromPipelineArtifacts(fases?: {
  raw: boolean;
  grade: boolean;
  overlays: boolean;
  compose: boolean;
  encode: boolean;
}): number {
  if (!fases) return 1;
  if (fases.encode) return 100;
  if (fases.compose) return 72;
  if (fases.overlays) return 55;
  if (fases.grade) return 22;
  if (fases.raw) return 8;
  return 1;
}
