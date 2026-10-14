import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import type { CenaRemotion } from "../schema";
import { shouldUseSharedCardZone } from "../shared-card-zone";
import { useSombraPadrao } from "../cenas-v2/_shared/sombra-context";
import { resolverNivel, type SombraNivel } from "../cenas-v2/_shared/sombra-tokens";
import { useEstiloDasCenas } from "./estilo-das-cenas";
import { useEntrada, useFonteDoLimpo } from "./Bloco";

/**
 * D-916: onde o Bloco senta e o que vai atrás dele.
 *
 * - Compartilhada (o card na coluna do palco): quem posiciona é a zona do corte
 *   (`SharedCardZoneFrame`, por fora). O Bloco desenha na origem do retângulo de
 *   cada tipo (92, 112) e senta no grafite, sem scrim nenhum.
 * - Cheia (o card sobre o vídeo): a posição e o tamanho são os do canal, e o
 *   scrim local segue o nível de sombra da cena — nunca uma caixa, a não ser no
 *   "forte", que é o bloco a 78% que o vídeo claro pede.
 */
export const ORIGEM_NA_ZONA = { x: 92, y: 112 } as const;
export const AUTOMATICA_NO_CHEIO = { x: 96, base: 120 } as const;

const GRAFITE = "18,20,23";

/** O fundo local do texto sobre o vídeo, por nível de sombra. */
export function scrimDoNivel(nivel: SombraNivel): CSSProperties {
  switch (nivel) {
    case "nenhuma":
      return { textShadow: "0 2px 12px rgba(0,0,0,0.6)" };
    case "leve":
      return { background: `radial-gradient(ellipse at 35% 50%, rgba(${GRAFITE},0.4) 0%, rgba(${GRAFITE},0) 72%)`, padding: 48, margin: -48 };
    case "forte":
      return { background: `rgba(${GRAFITE},0.78)`, borderRadius: 16, padding: 32, margin: -32 };
    default:
      return { background: `radial-gradient(ellipse at 35% 50%, rgba(${GRAFITE},0.6) 0%, rgba(${GRAFITE},0) 72%)`, padding: 48, margin: -48 };
  }
}

/** A cena está na coluna do palco compartilhado (e não sobre o vídeo cheio). */
export const estaNaZona = (cena: CenaRemotion): boolean => shouldUseSharedCardZone(cena);

export const Enquadramento: FC<{ cena: CenaRemotion; children: ReactNode }> = ({ cena, children }) => {
  const familia = useFonteDoLimpo();
  const { escala, posicao } = useEstiloDasCenas();
  const nivel = resolverNivel(cena.sombra_nivel, useSombraPadrao());
  const entrada = useEntrada(cena.fim - cena.inicio);
  const base: CSSProperties = { position: "absolute", fontFamily: familia, ...entrada };

  if (estaNaZona(cena)) {
    return (
      <AbsoluteFill>
        <div style={{ ...base, left: ORIGEM_NA_ZONA.x, top: ORIGEM_NA_ZONA.y }}>{children}</div>
      </AbsoluteFill>
    );
  }

  const lugar: CSSProperties = posicao.automatica
    ? { left: AUTOMATICA_NO_CHEIO.x, bottom: AUTOMATICA_NO_CHEIO.base, transformOrigin: "0 100%" }
    : { left: posicao.x, top: posicao.y, transformOrigin: "0 0" };
  return (
    <AbsoluteFill>
      <div style={{ ...base, ...lugar, transform: `${entrada.transform} scale(${escala})` }}>
        <div style={scrimDoNivel(nivel)}>{children}</div>
      </div>
    </AbsoluteFill>
  );
};

/** As cenas de quadro inteiro (tese, chamada final): scrim no quadro todo e conteúdo no centro. */
export const QuadroInteiro: FC<{ cena: CenaRemotion; opacidade: number; children: ReactNode }> = ({
  cena,
  opacidade,
  children,
}) => {
  const familia = useFonteDoLimpo();
  const entrada = useEntrada(cena.fim - cena.inicio);
  return (
    <AbsoluteFill style={{ fontFamily: familia, opacity: entrada.opacity }}>
      <AbsoluteFill style={{ background: `rgba(${GRAFITE},${opacidade})` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: entrada.transform }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
