import React from "react";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { PalcoShort, Veu, useCenaShort, type CenaShortProps } from "./_shared";

/**
 * citacao — a frase que vale ser lida, não só ouvida.
 *
 * Serve o caso em que a fala é de OUTRA pessoa (o trecho reagido). Ler a frase
 * com a atribuição visível evita o mal-entendido que a diarização da D-286
 * resolveu no texto: espectador atribuindo ao dono do canal uma fala que não é
 * dele.
 *
 * Fica no rodapé, acima da safe zone: ela acompanha a fala em vez de
 * interrompê-la, então não pode tapar quem está falando.
 */
export const CenaCitacaoShort: React.FC<CenaShortProps> = ({ cena }) => {
  const { opacity, corpo } = useCenaShort(cena);

  return (
    <>
      <Veu opacity={opacity * 0.8} forca={0.4} />
      <PalcoShort opacity={opacity} ancora="base">
        <p
          style={{
            margin: 0,
            fontFamily: F.serifItalic,
            fontSize: corpo(0.042),
            lineHeight: 1.22,
            color: C.branco,
            textShadow: "0 6px 26px rgba(0,0,0,0.75)",
          }}
        >
          “{cena.texto}”
        </p>
        {cena.apoio && (
          <p
            style={{
              margin: `${corpo(0.016)}px 0 0`,
              fontFamily: F.mono,
              fontSize: corpo(0.022),
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: C.azulAcento,
            }}
          >
            — {cena.apoio}
          </p>
        )}
      </PalcoShort>
    </>
  );
};
