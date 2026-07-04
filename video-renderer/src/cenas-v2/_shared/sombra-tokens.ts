/**
 * Níveis discretos de sombra/overlay aplicados às cenas v2 sobre vídeo.
 *
 * Cada nível ajusta três multiplicadores:
 *  - `cardOpacity`: opacity adicional do background do Chrome (0..1)
 *  - `ambient`: intensidade do AmbientHud (vinheta + grid global)
 *  - `region`: intensidade do RegionHud (halo no canto do card)
 *
 * O vídeo SEMPRE passa atrás — mesmo no nível "forte" não pintamos preto
 * sólido. A diferença é quanto o card se "sela" do vídeo (mais legível em
 * vídeos poluídos) ou se mantém aberto (mais cinematográfico em vídeos
 * limpos).
 */

export type SombraNivel = "nenhuma" | "leve" | "media" | "forte";
export type SombraNivelOuAuto = SombraNivel | "auto";

export interface SombraTokens {
  cardOpacity: number;
  ambient: number;
  region: number;
}

/** Multiplicadores por nível. Calibrados para vídeo passando atrás. */
export const SOMBRA_TOKENS: Record<SombraNivel, SombraTokens> = {
  nenhuma: { cardOpacity: 0.0, ambient: 0.0, region: 0.0 },
  leve: { cardOpacity: 0.35, ambient: 0.35, region: 0.4 },
  media: { cardOpacity: 0.75, ambient: 0.7, region: 0.7 },
  forte: { cardOpacity: 1.0, ambient: 1.0, region: 1.0 },
};

/**
 * Resolve um valor "auto" para o nível padrão do projeto.
 * Quando ambos são undefined cai em "media".
 */
export function resolverNivel(
  nivelCena: SombraNivelOuAuto | undefined,
  nivelPadrao: SombraNivel | undefined,
): SombraNivel {
  if (nivelCena && nivelCena !== "auto") return nivelCena;
  if (nivelPadrao) return nivelPadrao;
  return "media";
}

/** Atalho: tokens já resolvidos. */
export function tokensDeSombra(
  nivelCena: SombraNivelOuAuto | undefined,
  nivelPadrao: SombraNivel | undefined,
): SombraTokens {
  return SOMBRA_TOKENS[resolverNivel(nivelCena, nivelPadrao)];
}
