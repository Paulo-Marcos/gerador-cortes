import type {
  YoutubeFullConfig,
  YoutubeSharedConfig,
  YoutubeSharedRect,
} from '@/shared/palco/youtubeLayout';

/**
 * O override de um segmento é PARCIAL (F-048 / F-060, RN-10): só entra o que
 * difere da base do corte, e a chave ausente herda. Estas funções reduzem o
 * config que saiu do modal ao override que o segmento grava.
 */

function rectDifere(a: YoutubeSharedRect, b: YoutubeSharedRect) {
  return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;
}

export function overrideCompartilhadaDoSegmento(
  base: YoutubeSharedConfig,
  config: YoutubeSharedConfig,
): Partial<YoutubeSharedConfig> | undefined {
  const partial: Partial<YoutubeSharedConfig> = {};
  if (config.telas !== base.telas) partial.telas = config.telas;
  (['crop_facecam', 'crop_tela', 'slot_facecam', 'slot_tela'] as const).forEach((chave) => {
    if (rectDifere(config[chave], base[chave])) partial[chave] = config[chave];
  });
  // D-904: a zona dos cards do segmento só entra quando difere da do corte.
  // Voltar à automática num segmento cujo corte tem zona manual não cabe num
  // override parcial (ausente = herda).
  const zona = config.zona_card;
  if (zona && (!base.zona_card || rectDifere(zona, base.zona_card))) {
    partial.zona_card = zona;
  }
  return Object.keys(partial).length > 0 ? partial : undefined;
}

export function overrideFullDoSegmento(
  base: YoutubeFullConfig,
  novo: YoutubeFullConfig,
): Partial<YoutubeFullConfig> | undefined {
  const partial: Partial<YoutubeFullConfig> = {};
  (['crop', 'slot'] as const).forEach((chave) => {
    if (rectDifere(novo[chave], base[chave])) partial[chave] = novo[chave];
  });
  return Object.keys(partial).length > 0 ? partial : undefined;
}
