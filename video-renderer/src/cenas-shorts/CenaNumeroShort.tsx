import React from "react";
import { interpolate } from "remotion";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { PalcoShort, useCenaShort, type CenaShortProps } from "./_shared";

/**
 * numero — o dado que sustenta o argumento.
 *
 * Fica no ALTO, não no centro: o rosto de quem fala costuma ocupar o meio do
 * quadro vertical, e um número gigante em cima dele briga com a própria fala
 * que ele deveria reforçar.
 *
 * Sem contagem animada. No horizontal ela funciona porque a cena dura mais; num
 * short de 2 segundos o espectador veria o contador rodando e nunca o número.
 */
export const CenaNumeroShort: React.FC<CenaShortProps> = ({ cena }) => {
  const { opacity, entrada, corpo } = useCenaShort(cena);
  const escala = interpolate(entrada, [0, 1], [0.88, 1]);

  return (
    <PalcoShort opacity={opacity} ancora="topo">
      <div style={{ transform: `scale(${escala})`, transformOrigin: "center top" }}>
        <p
          style={{
            margin: 0,
            fontFamily: F.display,
            fontSize: corpo(0.13),
            fontWeight: 900,
            lineHeight: 0.94,
            letterSpacing: "-0.03em",
            color: C.azulAcento,
            textShadow: "0 10px 40px rgba(0,0,0,0.7)",
          }}
        >
          {cena.texto}
        </p>
        {cena.apoio && (
          <p
            style={{
              margin: `${corpo(0.012)}px 0 0`,
              fontFamily: F.display,
              fontSize: corpo(0.03),
              fontWeight: 700,
              lineHeight: 1.15,
              color: C.branco,
              textShadow: "0 4px 18px rgba(0,0,0,0.8)",
            }}
          >
            {cena.apoio}
          </p>
        )}
      </div>
    </PalcoShort>
  );
};
