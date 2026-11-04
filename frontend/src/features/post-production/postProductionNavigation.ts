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
  // pra cortes legados). O exportStatus só lista APROVADO/PROCESSADO,
  // então sozinho falha pra cortes em outros status que mesmo assim foram
  // renderizados/publicados.
  return Boolean(status?.video_pronto || corte.is_pos_producao === 1);
}

/**
 * D-1041: o principal da Pós sem bruto dizia "a limpeza apagou" até em corte que
 * nunca teve bruto. Sem limpeza, o caminho é o editor: o bruto sai dos cortes de
 * lá e a primeira geração também pede os metadados. `arquivos_limpos` só distingue
 * a limpeza completa; a que deixou resíduo cai no caminho do editor, que também
 * resolve. Render é GPU: o Enter não dispara, como já era (D-746).
 */
export function primarioDaPos(p: {
  rodando: boolean;
  progresso: number;
  videoPronto: boolean;
  brutoAusente: boolean;
  arquivosLimpos: boolean;
  onRenderizar: () => void;
  onIrAoEditor: () => void;
}) {
  if (p.brutoAusente && !p.arquivosLimpos && !p.rodando) {
    return {
      texto: 'Gerar bruto no editor',
      icone: 'scissors' as const,
      onClick: p.onIrAoEditor,
      semEnter: true,
    };
  }
  return {
    texto: p.rodando
      ? `Renderizando ${p.progresso}%`
      : p.videoPronto
        ? 'Renderizar de novo'
        : 'Renderizar final',
    icone: p.rodando ? ('loader' as const) : ('clapperboard' as const),
    onClick: p.onRenderizar,
    desabilitado: p.rodando || p.brutoAusente,
    motivo: p.brutoAusente
      ? 'Sem o vídeo bruto (a limpeza apagou): regere o bruto antes de renderizar.'
      : undefined,
    semEnter: true,
  };
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

export type VideoFontePos = 'final' | 'raw' | 'graded';

/**
 * Escolhe qual fonte o player da tela Pos exibe por PADRAO (D-368).
 *
 * Bruto-first: enquanto o `clip_raw` existe (`brutoDisponivel`), mostra o
 * BRUTO; so cai pro graded quando o bruto some — regra do usuario "se tem
 * bruto e bruto, se nao tem bruto pode ser o grade". `final` (upload_ready)
 * vence quando o corte ja foi renderizado.
 *
 * D-430: o bruto deixou de ser apagado no fim do render, entao este padrao
 * praticamente nunca mais cai em `graded` sozinho. Por isso a escolha virou
 * sobreponivel pelo usuario — ver `resolverVideoFonteEfetiva`.
 */
export function resolverVideoFonte(params: {
  videoPronto: boolean;
  brutoDisponivel: boolean;
}): VideoFontePos {
  if (params.videoPronto) return 'final';
  return params.brutoDisponivel ? 'raw' : 'graded';
}

/** Fontes que existem em disco, na ordem em que o seletor as apresenta. */
export function fontesDisponiveis(params: {
  brutoDisponivel: boolean;
  gradedDisponivel: boolean;
  videoPronto: boolean;
}): VideoFontePos[] {
  const fontes: VideoFontePos[] = [];
  if (params.brutoDisponivel) fontes.push('raw');
  if (params.gradedDisponivel) fontes.push('graded');
  if (params.videoPronto) fontes.push('final');
  return fontes;
}

/**
 * Concilia a escolha manual do usuario com o padrao automatico (D-430).
 *
 * A escolha so vale enquanto aquela fonte existir: trocar de corte com a
 * selecao presa, ou perder o graded, cai de volta no padrao em vez de apontar
 * o player para um arquivo que nao esta la.
 */
export function resolverVideoFonteEfetiva(params: {
  escolhida: VideoFontePos | null;
  disponiveis: VideoFontePos[];
  automatica: VideoFontePos;
}): VideoFontePos {
  if (params.escolhida && params.disponiveis.includes(params.escolhida)) {
    return params.escolhida;
  }
  return params.automatica;
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
