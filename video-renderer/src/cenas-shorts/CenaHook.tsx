import React from "react";
import { interpolate } from "remotion";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { PalcoShort, Veu, useCenaShort, type CenaShortProps } from "./_shared";

/**
 * hook — o cartão de abertura.
 *
 * É a cena mais cara do short: ela ocupa os segundos em que o espectador
 * decide ficar ou passar. Por isso ela viola de propósito a regra "não tape o
 * vídeo": aqui o texto É o conteúdo, e o quadro atrás dele é só contexto.
 *
 * Sobe levemente ao entrar — movimento na direção da leitura, que o olho segue
 * sem esforço — e some rápido, porque o hook cumpriu o papel quando a fala
 * começa.
 */
export const CenaHook: React.FC<CenaShortProps> = ({ cena }) => {
  const { opacity, entrada, corpo } = useCenaShort(cena);
  const subida = interpolate(entrada, [0, 1], [28, 0]);

  return (
    <>
      <Veu opacity={opacity} forca={0.62} />
      <PalcoShort opacity={opacity}>
        <div style={{ transform: `translateY(${subida}px)` }}>
          <p
            style={{
              margin: 0,
              fontFamily: F.display,
              fontSize: corpo(0.062),
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              color: C.branco,
              textShadow: "0 8px 32px rgba(0,0,0,0.65)",
            }}
          >
            {cena.texto}
          </p>
          {cena.apoio && (
            <p
              style={{
                margin: `${corpo(0.02)}px 0 0`,
                fontFamily: F.mono,
                fontSize: corpo(0.024),
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: C.azulAcento,
              }}
            >
              {cena.apoio}
            </p>
          )}
        </div>
      </PalcoShort>
    </>
  );
};
