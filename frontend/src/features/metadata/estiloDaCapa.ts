import type { CapaTikTokProps } from '@video-renderer/public-api';
import type { Retangulo } from '@/features/shorts/arrastarSlot';
import type { Schema } from '@/shared/api';
import type { ComponenteDaCapa, EstiloDaCapaTiktok } from '@/types/presets';

// D-933: o rascunho do modal "Estilizar capa" — funções puras sobre o contrato
// parcial do estilo (RN-10). O modal só guarda o rascunho; a geometria efetiva
// volta do backend (`/estilo/previa`), nunca é refeita aqui.

export type PainelDaCapa = Schema<'PainelDoEstiloDaCapaTiktok'>;

export const NOMES_DOS_COMPONENTES: Record<ComponenteDaCapa, string> = {
  etiqueta: 'Título',
  arte: 'Imagem',
  selo: '@ do canal',
  cabecalho: 'Cabeçalho do canal',
  acento: 'Traço de acento',
};

export const NOMES_DOS_ESTILOS: Record<NonNullable<EstiloDaCapaTiktok['estilo']>, string> = {
  palco: 'Seguir o palco',
  atual: 'Atual',
  limpo: 'Limpo',
};

const SO_NO_LIMPO: readonly ComponenteDaCapa[] = ['cabecalho', 'acento'];

/** Cabeçalho e acento só existem no estilo limpo: no atual o chrome não tem onde. */
export function podeAparecer(componente: ComponenteDaCapa, estiloEfetivo: string): boolean {
  return !SO_NO_LIMPO.includes(componente) || estiloEfetivo === 'limpo';
}

/** O salvo do backend sem as chaves nulas — o rascunho é parcial como o contrato. */
export function rascunhoDoSalvo(salvo: PainelDaCapa['salvo']): EstiloDaCapaTiktok {
  const rascunho: EstiloDaCapaTiktok = {};
  if (salvo.estilo) rascunho.estilo = salvo.estilo as EstiloDaCapaTiktok['estilo'];
  if (salvo.fundo) rascunho.fundo = salvo.fundo;
  if (salvo.visiveis) rascunho.visiveis = salvo.visiveis;
  if (salvo.posicoes) rascunho.posicoes = salvo.posicoes as EstiloDaCapaTiktok['posicoes'];
  return rascunho;
}

export function comVisibilidade(
  rascunho: EstiloDaCapaTiktok,
  componente: ComponenteDaCapa,
  visivel: boolean,
): EstiloDaCapaTiktok {
  return { ...rascunho, visiveis: { ...rascunho.visiveis, [componente]: visivel } };
}

/** Grava a posição solta no arraste, em pixel inteiro (o backend arredonda de novo). */
export function comPosicao(
  rascunho: EstiloDaCapaTiktok,
  componente: ComponenteDaCapa,
  r: Retangulo,
): EstiloDaCapaTiktok {
  const inteiro = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  return { ...rascunho, posicoes: { ...rascunho.posicoes, [componente]: inteiro } };
}

/** As faixas que se arrastam: só as dos componentes que estão na capa. */
export function blocosVisiveis(painel: PainelDaCapa): Record<string, Retangulo> {
  const { faixas, visiveis } = painel.efetivo;
  return Object.fromEntries(Object.entries(faixas).filter(([componente]) => visiveis[componente]));
}

/** Os props da composição do renderer para a prévia — os mesmos do PNG. */
export function propsDaPrevia(painel: PainelDaCapa, etiqueta: string): CapaTikTokProps {
  const { arte, ...faixas } = painel.efetivo.faixas;
  const visiveis = painel.efetivo.visiveis;
  return {
    estilo: painel.efetivo.estilo === 'limpo' ? 'limpo' : 'atual',
    fundoLimpo: painel.efetivo.fundo,
    fundo: painel.fundo_do_atual as CapaTikTokProps['fundo'],
    etiqueta: etiqueta.toUpperCase(),
    selo: painel.cabecalho.handle,
    frameDataUri: painel.arte,
    faixas: { ...faixas, frame: arte } as CapaTikTokProps['faixas'],
    visiveis,
    cabecalho: visiveis.cabecalho ? painel.cabecalho : undefined,
  };
}
