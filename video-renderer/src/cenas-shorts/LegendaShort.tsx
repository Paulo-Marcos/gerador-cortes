import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { COLORS_V2, FONTS_V2 } from "../theme-v2";

// D-462: a legenda queimada do short.
//
// Ela não é acessibilidade — é o conteúdo. 85% das visualizações de short
// acontecem no mudo, então quem não lê, não assiste. Daí cada decisão abaixo
// ter um porquê editorial, não estético:
//
//   - aparece na PRIMEIRA palavra (nada de atraso de 2s: o hook está aí);
//   - 4 a 7 palavras por página, que é o que o olho pega numa sacada;
//   - realce na palavra corrente, para o olho seguir em vez de reler;
//   - dentro da SAFE ZONE — topo e base pertencem à UI dos apps, e legenda
//     debaixo do botão de curtir é legenda que ninguém leu.

/** Agrupamento em página. 200-500ms = palavra a palavra; 1200ms+ = frase. */
const AGRUPAMENTO_MS = 1200;

/** Fração da altura ocupada pela UI dos apps, em cima e embaixo. */
const SAFE_ZONE = 0.18;

export interface LegendaShortProps {
  /** Tokens vindos do backend (`services/legendas_short.py`). */
  captions: Caption[];
  /** Sobe a legenda quando há algo desenhado no rodapé (CTA, marca). */
  deslocamentoRodape?: number;
}

export const LegendaShort: React.FC<LegendaShortProps> = ({
  captions,
  deslocamentoRodape = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const agoraMs = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: AGRUPAMENTO_MS,
      }),
    [captions],
  );

  const pagina = useMemo(
    () =>
      pages.find(
        (p) => agoraMs >= p.startMs && agoraMs < p.startMs + p.durationMs,
      ),
    [pages, agoraMs],
  );

  if (!pagina) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: height * SAFE_ZONE + deslocamentoRodape,
        width: "84%",
        textAlign: "center",
        fontFamily: FONTS_V2.display,
        fontSize: Math.round(height * 0.042),
        fontWeight: 800,
        lineHeight: 1.18,
        letterSpacing: "-0.01em",
        // Contorno em vez de caixa: a caixa esconde o vídeo, e o vídeo é o que
        // segura o dedo. O contorno mantém o contraste sobre qualquer fundo.
        textShadow:
          "0 2px 0 rgba(0,0,0,0.85), 0 -2px 0 rgba(0,0,0,0.85), 2px 0 0 rgba(0,0,0,0.85), -2px 0 0 rgba(0,0,0,0.85), 0 6px 18px rgba(0,0,0,0.55)",
      }}
    >
      {pagina.tokens.map((token, indice) => {
        const corrente = agoraMs >= token.fromMs && agoraMs < token.toMs;
        return (
          <span
            key={`${token.fromMs}-${indice}`}
            style={{
              color: corrente ? COLORS_V2.azulAcento : COLORS_V2.branco,
              whiteSpace: "pre",
            }}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
};
