import React, { useContext } from "react";
import type { CenaRemotion } from "../../schema";

export type CardLayout = "horizontal" | "vertical";
export type CardLayoutOuAuto = CardLayout | "auto";

export const CardLayoutContext = React.createContext<CardLayout>("vertical");

export function resolverCardLayout(
  layout: CardLayoutOuAuto | undefined,
  padrao: CardLayout,
): CardLayout {
  if (layout === "horizontal" || layout === "vertical") return layout;
  return padrao;
}

export function useCardLayoutPadrao(): CardLayout {
  return useContext(CardLayoutContext);
}

export function useCardLayout(cena: Pick<CenaRemotion, "layout_card">): CardLayout {
  return resolverCardLayout(cena.layout_card, useCardLayoutPadrao());
}
