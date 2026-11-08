import { useMemo } from 'react';
import { tirarCenasRiscadas } from '@video-renderer/public-api';
import { avisosDaCena, useAvisosDasCenas } from '@/features/editor/useCenas';
import type { CenaRemotion } from '@/types/models';
import type { IconName } from '@/upgrade/Icon';
import { validateSceneOverlaps, type SceneValidationResult } from './sceneValidation';

// ─────────────────────────────────────────────────────────────────────────────
// O plano de cenas da Pós (D-1070). Cada cena diz de onde veio, e a mesma cor vale
// no card e na linha do tempo. A conferência só avisa (RN-35): "pede conferência"
// não trava a validação, só conta quantas faltam.
// ─────────────────────────────────────────────────────────────────────────────

export type OrigemNoPlano = 'conferida' | 'conferir' | 'manual' | 'riscada';

type Aviso = Parameters<typeof avisosDaCena>[0][number];

/** A mesma regra do render: a riscada fica no plano e fora do vídeo. */
export { tirarCenasRiscadas };

/**
 * A riscada vem antes de tudo: não vai ao vídeo. A manual vem antes dos avisos, porque
 * a conferência confere o que a IA afirmou. Os avisos da cena manual continuam visíveis
 * embaixo dela.
 */
export function origemNoPlano(cena: CenaRemotion, avisos: string[]): OrigemNoPlano {
  if (cena.riscada) return 'riscada';
  if (cena.manual) return 'manual';
  return avisos.length > 0 ? 'conferir' : 'conferida';
}

export const origensDoPlano = (cenas: CenaRemotion[], avisos: Aviso[]): OrigemNoPlano[] =>
  cenas.map((cena) => origemNoPlano(cena, avisosDaCena(avisos, cena)));

/**
 * Os avisos que ainda contam: os das cenas que vão ao vídeo. O aviso de uma cena riscada
 * não pede mais nada (a barra de pendências do corte também não o conta).
 */
export const avisosDoQueVaiAoVideo = <A extends Aviso>(avisos: A[], cenas: CenaRemotion[]): A[] =>
  avisos.filter((aviso) => !cenas.some((cena) => cena.riscada && avisosDaCena([aviso], cena).length > 0));

/** Quantas cenas ainda pedem conferência: o "faltam N" do Validar o plano. */
export const contarQuantasFaltam = (origens: OrigemNoPlano[]): number =>
  origens.filter((origem) => origem === 'conferir').length;

/**
 * O plano do painel: o que vai ao vídeo, quantas riscadas, a origem de cada cena e quantas
 * faltam conferir. Os números do painel falam do que vai ao vídeo.
 */
export function usePlanoDasCenas(corteId: string, cenasOrdenadas: CenaRemotion[]) {
  const avisos = useAvisosDasCenas(corteId);
  return useMemo(() => {
    const cenasDoRender = tirarCenasRiscadas(cenasOrdenadas);
    const origens = origensDoPlano(cenasOrdenadas, avisos);
    const riscadas = cenasOrdenadas.length - cenasDoRender.length;
    return { cenasDoRender, riscadas, origens, faltam: contarQuantasFaltam(origens) };
  }, [cenasOrdenadas, avisos]);
}

/**
 * O que cada origem mostra: o rótulo do card, o da legenda, as cores (fundo, borda, texto)
 * e o ícone. O ícone e o tracejado distinguem a origem sem depender só da cor (WCAG 1.4.1).
 */
export const ORIGENS: Record<
  OrigemNoPlano,
  { rotulo: string; legenda: string; icone: IconName; soft: string; border: string; color: string; tracejada?: boolean }
> = {
  conferida: {
    rotulo: 'da IA · conferida',
    legenda: 'da IA, conferida',
    icone: 'check',
    soft: 'var(--wb-info-soft)',
    border: 'var(--wb-info)',
    color: 'var(--wb-info)',
  },
  conferir: {
    rotulo: 'conferir',
    legenda: 'pede conferência',
    icone: 'triangle-alert',
    soft: 'var(--wb-warn-soft)',
    border: 'var(--wb-warn)',
    color: 'var(--wb-warn-ink)',
  },
  // D-1075 (RN-39): gerar de novo mantém a manual e descarta a cena da IA que cai em cima.
  manual: {
    rotulo: 'manual · a IA não mexe',
    legenda: 'manual, a IA não mexe',
    icone: 'pen',
    soft: 'var(--wb-ok-soft)',
    border: 'var(--wb-ok)',
    color: 'var(--wb-ok-ink)',
  },
  riscada: {
    rotulo: 'riscada',
    legenda: 'riscada',
    icone: 'eye-off',
    soft: 'var(--wb-bg-inset)',
    border: 'var(--wb-text-dim)',
    color: 'var(--wb-text-dim)',
    tracejada: true,
  },
};

/**
 * Os campos do que a cena diz. Mexer neles faz a cena virar do operador. Tempo, visual
 * (sombra, layout, modelo, zona) e posição não contam. A fonte também não: anotar a
 * fonte é conferir a cena, não reescrevê-la. O retrato é da busca de retratos.
 */
const CAMPOS_DO_CONTEUDO = [
  'tipo',
  'texto',
  'nome_curto',
  'subtexto',
  'icone',
  'numero',
  'contexto',
  'rotuloA',
  'rotuloB',
  'cor',
  'url',
  'autor',
  'obra',
  'ano',
  'marcos',
  'itens',
] as const satisfies readonly (keyof CenaRemotion)[];

const mesmoValor = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A cena editada, marcada como manual se o operador reescreveu o conteúdo. Nada desmarca. */
export function marcarSeReescrita(antes: CenaRemotion, depois: CenaRemotion): CenaRemotion {
  if (depois.manual) return depois;
  const reescreveu = CAMPOS_DO_CONTEUDO.some((campo) => !mesmoValor(antes[campo], depois[campo]));
  return reescreveu ? { ...depois, manual: true } : depois;
}

/** A cena do "Gerar manual": nasce do operador, depois da última do plano. */
export function criarCenaManual(cenasOrdenadas: CenaRemotion[]): CenaRemotion {
  const ultima = cenasOrdenadas[cenasOrdenadas.length - 1];
  const inicio = ultima ? ultima.fim : 0;
  return {
    tipo: 'barra_inferior',
    inicio,
    fim: inicio + 5,
    texto: 'Nova cena',
    manual: true,
    modelo_cena: 'card',
    layout_card: 'auto',
    sombra_nivel: 'auto',
  };
}

export const riscarCena = (cena: CenaRemotion): CenaRemotion => ({ ...cena, riscada: true });

/** Tira a marca em vez de gravar `false`: a cena volta a ser como era. */
export function trazerCenaDeVolta(cena: CenaRemotion): CenaRemotion {
  const { riscada: _riscada, ...devolvida } = cena;
  return devolvida;
}

/** A sobreposição só entre as cenas que vão ao vídeo, com os índices da lista inteira. */
export function validarSobreposicoesDoPlano(cenasOrdenadas: CenaRemotion[]): SceneValidationResult {
  const indices = cenasOrdenadas.flatMap((cena, idx) => (cena.riscada ? [] : [idx]));
  const resultado = validateSceneOverlaps(indices.map((idx) => cenasOrdenadas[idx]));
  return {
    overlappingIndices: new Set([...resultado.overlappingIndices].map((i) => indices[i])),
    maxSimultaneous: resultado.maxSimultaneous,
  };
}
