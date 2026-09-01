import React from "react";
import { interpolate } from "remotion";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { PalcoShort, Veu, useCenaShort, type CenaShortProps } from "./_shared";

/**
 * cta — o convite para o vídeo longo.
 *
 * O short é funil, não destino: ele existe para levar alguém ao corte inteiro.
 * Mas o CTA só aparece no FIM, e curto — pedir antes de entregar é o jeito mais
 * rápido de perder a retenção que o resto do short construiu.
 *
 * Tapa o quadro de propósito. Aqui a fala já acabou; o que resta na tela é o
 * convite.
 */
export const CenaCtaShort: React.FC<CenaShortProps> = ({ cena }) => {
  const { opacity, entrada, corpo } = useCenaShort(cena);
  const subida = interpolate(entrada, [0, 1], [20, 0]);

  return (
    <>
      <Veu opacity={opacity} forca={0.78} />
      <PalcoShort opacity={opacity}>
        <div style={{ transform: `translateY(${subida}px)` }}>
          <p
            style={{
              margin: 0,
              fontFamily: F.display,
              fontSize: corpo(0.055),
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              color: C.branco,
            }}
          >
            {cena.texto}
          </p>
          {cena.apoio && (
            <p
              style={{
                margin: `${corpo(0.024)}px auto 0`,
                padding: `${corpo(0.012)}px ${corpo(0.028)}px`,
                display: "inline-block",
                borderRadius: 999,
                border: `2px solid ${C.azulAcento}`,
                fontFamily: F.mono,
                fontSize: corpo(0.024),
                fontWeight: 700,
                letterSpacing: "0.05em",
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
