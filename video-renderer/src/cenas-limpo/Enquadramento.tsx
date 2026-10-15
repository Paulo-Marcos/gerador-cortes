import { useLayoutEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { CenaRemotion } from "../schema";
import { shouldUseSharedCardZone } from "../shared-card-zone";
import { useSombraPadrao } from "../cenas-v2/_shared/sombra-context";
import { resolverNivel, type SombraNivel } from "../cenas-v2/_shared/sombra-tokens";
import { useEstiloDasCenas } from "./estilo-das-cenas";
import { useFonteDoLimpo } from "./Bloco";
import { assentar, duracaoEmQuadros, opacidadeDeSaida, QUADROS } from "./movimento";
import { TempoDaCenaContext, useContinuidade, useQuadroDaCena, type TempoDaCena } from "./tempo-da-cena";

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

/** O tempo desta cena (D-918): fim em quadros e se ela continua a vizinha (morph). */
function useTempoDestaCena(cena: CenaRemotion): TempoDaCena {
  const { fps } = useVideoConfig();
  const continuidade = useContinuidade();
  return {
    ...continuidade,
    fim: duracaoEmQuadros(cena.tipo, cena.inicio, cena.fim, fps),
    // O mesmo arredondamento do `from` da Sequence na linha do tempo.
    inicio: Math.max(0, Math.round(cena.inicio * fps)),
  };
}

export const Enquadramento: FC<{ cena: CenaRemotion; children: ReactNode }> = ({ cena, children }) => {
  const familia = useFonteDoLimpo();
  const { escala, posicao } = useEstiloDasCenas();
  const nivel = resolverNivel(cena.sombra_nivel, useSombraPadrao());
  const tempo = useTempoDestaCena(cena);
  const quadro = useQuadroDaCena(tempo.inicio);
  // A barra inferior para em 4 s mesmo que a cena dure mais (D-918).
  if (quadro < 0 || quadro >= tempo.fim) return null;
  const base: CSSProperties = { position: "absolute", fontFamily: familia };

  if (estaNaZona(cena) && cena.layout_card_zone) {
    return (
      <TempoDaCenaContext.Provider value={tempo}>
        <AbsoluteFill>
          <CardNaZona zona={cena.layout_card_zone} familia={familia}>
            {children}
          </CardNaZona>
        </AbsoluteFill>
      </TempoDaCenaContext.Provider>
    );
  }

  const lugar: CSSProperties = posicao.automatica
    ? { left: AUTOMATICA_NO_CHEIO.x, bottom: AUTOMATICA_NO_CHEIO.base, transformOrigin: "0 100%" }
    : { left: posicao.x, top: posicao.y, transformOrigin: "0 0" };
  // O scrim acompanha o texto: aparece com o traço e some com a cena.
  const scrim = Math.min(assentar(quadro / QUADROS.traco), opacidadeDeSaida(quadro, tempo.fim, tempo.naProxima));
  return (
    <TempoDaCenaContext.Provider value={tempo}>
      <AbsoluteFill>
        <div style={{ ...base, ...lugar, transform: `scale(${escala})` }}>
          <div style={{ ...scrimDoNivel(nivel), position: "absolute", inset: 0, opacity: tempo.daAnterior ? 1 : scrim }} />
          <div style={{ position: "relative", textShadow: scrimDoNivel(nivel).textShadow }}>{children}</div>
        </div>
      </AbsoluteFill>
    </TempoDaCenaContext.Provider>
  );
};

/** As cenas de quadro inteiro (tese, chamada final): scrim no quadro todo e conteúdo no centro. */
export const QuadroInteiro: FC<{ cena: CenaRemotion; opacidade: number; children: ReactNode }> = ({
  cena,
  opacidade,
  children,
}) => {
  const familia = useFonteDoLimpo();
  const tempo = useTempoDestaCena(cena);
  const quadro = useQuadroDaCena(tempo.inicio);
  const fundo = Math.min(assentar(quadro / QUADROS.traco), opacidadeDeSaida(quadro, tempo.fim));
  return (
    <TempoDaCenaContext.Provider value={tempo}>
      <AbsoluteFill style={{ fontFamily: familia }}>
        <AbsoluteFill style={{ background: `rgba(${GRAFITE},${opacidade})`, opacity: fundo }} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </TempoDaCenaContext.Provider>
  );
};

/** D-926: quanto o card pode crescer no "preencher" (um termo curto não vira um cartaz). */
export const CRESCIMENTO_MAXIMO = 2.5;
/** A folga entre o card e a borda da zona, no "preencher". */
const MARGEM_NA_ZONA = 0.92;

const ALINHA = { topo: "flex-start", centro: "center", base: "flex-end", esquerda: "flex-start", direita: "flex-end" } as const;
const ORIGEM = { topo: "top", centro: "center", base: "bottom", esquerda: "left", direita: "right" } as const;

/** A escala do card na zona: cabe sempre; no "preencher", também cresce até a folga. */
export function escalaNaZona(
  natural: { w: number; h: number },
  zona: { w: number; h: number },
  ajuste: "preencher" | "natural",
): number {
  if (natural.w <= 0 || natural.h <= 0) return 1;
  const margem = ajuste === "preencher" ? MARGEM_NA_ZONA : 1;
  const cabe = Math.min((zona.w * margem) / natural.w, (zona.h * margem) / natural.h);
  return ajuste === "preencher" ? Math.min(cabe, CRESCIMENTO_MAXIMO) : Math.min(cabe, 1);
}

/**
 * D-926: o card dentro da zona dos cards (a compartilhada), alinhado como o
 * canal escolheu e, no "preencher", do tamanho que o espaço permite — pouco
 * texto cresce, muito texto encolhe. O card mede o próprio tamanho natural
 * (largura do bloco, altura do texto) e escala a partir do ponto de alinhamento,
 * então centralizado continua centralizado depois de crescer.
 */
const CardNaZona: FC<{ zona: { x: number; y: number; w: number; h: number }; familia: string; children: ReactNode }> = ({
  zona,
  familia,
  children,
}) => {
  const { ajuste, alinhamento_vertical: vertical, alinhamento_horizontal: horizontal } = useEstiloDasCenas();
  const card = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    // `offsetWidth/Height` ignoram o `transform`: é sempre o tamanho natural.
    setEscala(escalaNaZona({ w: el.offsetWidth, h: el.offsetHeight }, zona, ajuste));
  }, [zona.w, zona.h, ajuste]);
  return (
    <div
      data-zona-dos-cards=""
      style={{
        position: "absolute",
        left: zona.x,
        top: zona.y,
        width: zona.w,
        height: zona.h,
        display: "flex",
        alignItems: ALINHA[vertical],
        justifyContent: ALINHA[horizontal],
        fontFamily: familia,
      }}
    >
      <div
        ref={card}
        style={{ flex: "0 0 auto", transform: `scale(${escala})`, transformOrigin: `${ORIGEM[horizontal]} ${ORIGEM[vertical]}` }}
      >
        {children}
      </div>
    </div>
  );
};

