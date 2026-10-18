/**
 * Constantes e helpers puros compartilhados entre o YoutubeLayoutPanel e seus
 * subcomponentes (E-006).
 */
import type { YoutubeLayoutMode } from '@/shared/palco/youtubeLayout';
import type { OrigemDoTipo } from '../youtubeLayoutPadrao';

export const MODE_LABEL: Record<YoutubeLayoutMode, string> = {
  full: 'Full',
  compartilhada: 'Compartilhada',
};

/** Rotulo curto para pilulas e chips, onde 'Compartilhada' nao cabe. */
export const MODE_SHORT: Record<YoutubeLayoutMode, string> = {
  full: 'FULL',
  compartilhada: 'COMP.',
};


export function round(value: number) {
  return Math.round(value * 10) / 10;
}

const ROTULO_ORIGEM: Record<OrigemDoTipo, string> = {
  projeto: 'Projeto',
  global: 'Global',
  padrao: 'padrão do app',
};

/**
 * A legenda da linha "Este corte" do ModoBlock (D-970, RN-10): herdando ou
 * sobrescrevendo, cita o escopo de onde o modo vem de verdade — antes dizia
 * "do Projeto" mesmo quando o projeto também herdava do Global (D-971).
 */
export function legendaDoModoDoCorte(
  herdando: boolean,
  origem: OrigemDoTipo,
  tipoProjeto: YoutubeLayoutMode,
): string {
  return herdando
    ? `↳ herdando do ${ROTULO_ORIGEM[origem]}: ${MODE_LABEL[tipoProjeto]}`
    : `sobrescrevendo o ${ROTULO_ORIGEM[origem]} (${MODE_LABEL[tipoProjeto]})`;
}
