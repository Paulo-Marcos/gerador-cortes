import type { CenaRemotion } from '@/types/models';

export type LayoutCardPadrao = 'horizontal' | 'vertical';

export function aplicarLayoutCardPadrao(
  cena: CenaRemotion,
  layoutPadrao: LayoutCardPadrao,
): CenaRemotion {
  const layout =
    cena.layout_card === 'horizontal' || cena.layout_card === 'vertical'
      ? cena.layout_card
      : layoutPadrao;
  return { ...cena, layout_card: layout };
}

export function modeloCenaEfetivo(cena: CenaRemotion) {
  // I-031: tela_cheia SEMPRE vira card (ignora seletor).
  if (cena.tipo === 'tela_cheia') {
    return 'card';
  }
  if (cena.modelo_cena && cena.modelo_cena !== 'auto') {
    return cena.modelo_cena;
  }
  return 'padrao';
}

export function buildCenaVisualRevision(cenas: CenaRemotion[]) {
  return cenas
    .map((cena) =>
      [
        cena.tipo,
        cena.inicio,
        cena.fim,
        cena.layout_card ?? 'auto',
        modeloCenaEfetivo(cena),
        cena.sombra_nivel ?? 'auto',
      ].join(':'),
    )
    .join('|');
}
