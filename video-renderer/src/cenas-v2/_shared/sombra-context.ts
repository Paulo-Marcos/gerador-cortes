import { createContext, useContext } from "react";
import type { CenaRemotion } from "../../schema";
import {
  resolverNivel,
  tokensDeSombra,
  type SombraNivel,
  type SombraTokens,
} from "./sombra-tokens";

/**
 * Provider injeta o nível padrão de sombra da composição (vindo de
 * `youtubeSchema.sombraNivelPadrao`). Cada cena pode sobrescrever via
 * `cena.sombra_nivel`.
 */
export const SombraContext = createContext<SombraNivel>("media");

export function useSombraPadrao(): SombraNivel {
  return useContext(SombraContext);
}

/**
 * Atalho que cada cena chama uma vez para obter os multiplicadores
 * finais (cardOpacity, ambient, region) já resolvendo "auto" pelo
 * default da composição.
 */
export function useSombra(cena: Pick<CenaRemotion, "sombra_nivel">): SombraTokens {
  const padrao = useSombraPadrao();
  return tokensDeSombra(cena.sombra_nivel, padrao);
}

/** Versão sem-cena (para usos onde só interessa o padrão da composição). */
export function useSombraNivelAtual(): SombraNivel {
  return resolverNivel(undefined, useSombraPadrao());
}
