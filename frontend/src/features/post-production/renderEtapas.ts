import type { PipelineStatusResponse } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// Domínio (puro) do render granular por etapas — D-064.
//
// O pipeline tem 3 fases: grade → overlays → render final. O usuário marca
// um intervalo CONTÍGUO de fases para (re)executar e o backend roda só essas,
// parando após a última. Permite corrigir uma fase isolada (ex.: grade saiu
// com 2 min em vez de 10) sem refazer o pipeline inteiro.
//
// Sem React, sem I/O: testável isoladamente.
// ─────────────────────────────────────────────────────────────

export type FaseRender = 'grade' | 'overlays' | 'render_final';

export const SEQUENCIA_FASES: readonly FaseRender[] = [
  'grade',
  'overlays',
  'render_final',
] as const;

export interface FaseRenderInfo {
  fase: FaseRender;
  label: string;
  descricao: string;
}

export const FASES_RENDER: readonly FaseRenderInfo[] = [
  { fase: 'grade', label: 'Grade', descricao: 'Cor e filtro cinematográfico sobre o bruto.' },
  { fase: 'overlays', label: 'Overlays', descricao: 'Cenas e cards transparentes (Remotion).' },
  {
    fase: 'render_final',
    label: 'Render final',
    descricao: 'Compõe os overlays sobre a grade e gera o vídeo.',
  },
] as const;

/** Opções já prontas para `useRenderizarRemotion().mutate(...)`. */
export interface RenderRequest {
  startFrom: FaseRender;
  pararEm?: FaseRender;
  continuar: boolean;
}

/** True se a fase já tem artefato pronto segundo o status do pipeline. */
export function fasePronta(fase: FaseRender, status?: PipelineStatusResponse): boolean {
  if (!status) return false;
  if (fase === 'grade') return Boolean(status.fases.grade);
  if (fase === 'overlays') return Boolean(status.fases.overlays);
  return Boolean(status.fases.encode || status.fases.compose);
}

/**
 * Uma fase só pode ser ponto de partida se as anteriores existem: a grade
 * precisa do bruto (sempre disponível); overlays e render final precisam da
 * grade pronta. (O backend recusa iniciar depois da grade sem ela.)
 */
export function faseSelecionavel(fase: FaseRender, status?: PipelineStatusResponse): boolean {
  if (fase === 'grade') return true;
  return fasePronta('grade', status);
}

/** Reduz uma seleção qualquer ao intervalo contíguo [min..max] das fases marcadas. */
export function intervaloContiguo(selecao: ReadonlySet<FaseRender>): FaseRender[] {
  const indices = SEQUENCIA_FASES.map((f, i) => (selecao.has(f) ? i : -1)).filter((i) => i >= 0);
  if (indices.length === 0) return [];
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  return SEQUENCIA_FASES.slice(min, max + 1);
}

/**
 * Alterna `fase` mantendo a seleção contígua:
 * - marcar uma fase nova: adiciona e preenche o intervalo até a outra ponta.
 * - desmarcar uma ponta: encolhe o intervalo.
 * - desmarcar uma fase do meio: no-op (é obrigatória entre duas marcadas).
 */
export function alternarFase(selecao: ReadonlySet<FaseRender>, fase: FaseRender): Set<FaseRender> {
  const atual = intervaloContiguo(selecao);
  if (!atual.includes(fase)) {
    const expandida = new Set(atual);
    expandida.add(fase);
    return new Set(intervaloContiguo(expandida));
  }
  const ehPonta = fase === atual[0] || fase === atual[atual.length - 1];
  if (ehPonta) {
    return new Set(atual.filter((f) => f !== fase));
  }
  return new Set(atual);
}

/** True quando a fase está marcada e é intermediária (não pode ser desmarcada sozinha). */
export function faseEhMeioObrigatorio(selecao: ReadonlySet<FaseRender>, fase: FaseRender): boolean {
  const atual = intervaloContiguo(selecao);
  if (atual.length < 3) return false;
  return fase !== atual[0] && fase !== atual[atual.length - 1] && atual.includes(fase);
}

/**
 * Converte a seleção (intervalo contíguo) nas opções do request:
 * - `startFrom` = primeira fase marcada (refaz a partir daí).
 * - `pararEm`   = última fase marcada; omitido quando é `render_final`
 *   (nesse caso roda até o fim e finaliza o corte).
 * - `continuar` só altera o comportamento dos overlays (retomar chunks
 *   prontos vs. refazer do zero).
 *
 * Retorna `null` quando nada está marcado.
 */
export function selecaoParaRequest(
  selecao: ReadonlySet<FaseRender>,
  opts: { reaproveitarOverlays: boolean },
): RenderRequest | null {
  const intervalo = intervaloContiguo(selecao);
  if (intervalo.length === 0) return null;
  const startFrom = intervalo[0];
  const ultima = intervalo[intervalo.length - 1];
  return {
    startFrom,
    pararEm: ultima === 'render_final' ? undefined : ultima,
    continuar: opts.reaproveitarOverlays,
  };
}

/** Resumo legível do que o request vai fazer (mostrado no modal). */
export function descreverRequest(req: RenderRequest | null): string {
  if (!req) return 'Marque ao menos uma etapa.';
  const inicio = FASES_RENDER.find((f) => f.fase === req.startFrom)?.label ?? req.startFrom;
  if (!req.pararEm) {
    return `Roda de "${inicio}" até o render final e finaliza o corte.`;
  }
  const fim = FASES_RENDER.find((f) => f.fase === req.pararEm)?.label ?? req.pararEm;
  if (req.startFrom === req.pararEm) {
    return `Roda só "${inicio}" e para — as demais etapas ficam preservadas para conferência.`;
  }
  return `Roda de "${inicio}" até "${fim}" e para, sem refazer o render final.`;
}
