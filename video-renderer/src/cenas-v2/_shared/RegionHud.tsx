import React from "react";
import { COLORS_V2 as C } from "../../theme-v2";

export type RegionAnchor = "tl" | "tr" | "bl" | "br";

interface Props {
  /** Canto onde o card mora — determina onde o halo de textura é plantado. */
  anchor: RegionAnchor;
  /** Intensidade global do halo (0..1). Default 1. */
  intensity?: number;
}

/**
 * Halo local de textura concentrado perto do card. Diferente do AmbientHud,
 * NÃO cobre a tela inteira nem aplica vinheta — assim o vídeo de fundo
 * continua aparecendo no resto da composição.
 *
 * Posiciona 3 elementos relativos à `anchor`:
 *  - Anéis concêntricos no canto onde o card está (atrás dele)
 *  - Semicírculos no canto vizinho (na mesma borda horizontal)
 *  - Matriz de dots logo acima/abaixo do card (lado interno)
 */
export const RegionHud: React.FC<Props> = ({ anchor, intensity = 1 }) => {
  const opR = 0.55 * intensity;
  const opS = 0.5 * intensity;
  const opD = 0.45 * intensity;

  // Coordenadas dos anéis (saem do canto da âncora, "abraçando" o card)
  const ringPos = {
    tl: { top: -120, left: -120 },
    tr: { top: -120, right: -120 },
    bl: { bottom: -120, left: -120 },
    br: { bottom: -120, right: -120 },
  }[anchor];

  // Coordenadas dos semicírculos (canto vizinho horizontalmente)
  const semiPos = {
    tl: { top: -80, right: -80 },
    tr: { top: -80, left: -80 },
    bl: { bottom: -80, right: -80 },
    br: { bottom: -80, left: -80 },
  }[anchor];

  // Coordenadas dos dots (lado interno do canto)
  const dotsPos = {
    tl: { top: 280, left: 40 },
    tr: { top: 280, right: 40 },
    bl: { bottom: 280, left: 40 },
    br: { bottom: 280, right: 40 },
  }[anchor];

  // Semicírculos posicionados — qual é o cx do círculo dentro do svg?
  const semiAlignedRight = anchor === "tl" || anchor === "bl";
  const semiCx = semiAlignedRight ? 460 : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* Anéis concêntricos perto do card */}
      <svg
        width={520}
        height={520}
        viewBox="0 0 520 520"
        style={{ position: "absolute", opacity: opR, ...ringPos }}
      >
        <g stroke={C.azulSoft} fill="none" strokeWidth="1.2">
          <circle
            cx={anchor.endsWith("l") ? 0 : 520}
            cy={anchor.startsWith("t") ? 0 : 520}
            r="220"
          />
          <circle
            cx={anchor.endsWith("l") ? 0 : 520}
            cy={anchor.startsWith("t") ? 0 : 520}
            r="290"
          />
          <circle
            cx={anchor.endsWith("l") ? 0 : 520}
            cy={anchor.startsWith("t") ? 0 : 520}
            r="360"
          />
          <circle
            cx={anchor.endsWith("l") ? 0 : 520}
            cy={anchor.startsWith("t") ? 0 : 520}
            r="430"
          />
        </g>
      </svg>

      {/* Semicírculos no canto vizinho */}
      <svg
        width={460}
        height={320}
        viewBox="0 0 460 320"
        style={{ position: "absolute", opacity: opS, ...semiPos }}
      >
        <g stroke="rgba(150,205,235,0.65)" fill="none" strokeWidth="1.2">
          <circle
            cx={semiCx}
            cy={anchor.startsWith("t") ? 0 : 320}
            r="150"
          />
          <circle
            cx={semiCx}
            cy={anchor.startsWith("t") ? 0 : 320}
            r="200"
          />
          <circle
            cx={semiCx}
            cy={anchor.startsWith("t") ? 0 : 320}
            r="250"
          />
        </g>
      </svg>

      {/* Matriz de dots na vizinhança do card (lado interno) */}
      <svg
        width={240}
        height={140}
        viewBox="0 0 240 140"
        style={{ position: "absolute", opacity: opD, ...dotsPos }}
      >
        <g fill="rgba(150,205,235,0.75)">
          {Array.from({ length: 4 }).map((_, row) =>
            Array.from({ length: 8 }).map((__, col) => (
              <circle
                key={`${row}-${col}`}
                cx={14 + col * 28}
                cy={14 + row * 28}
                r="1.6"
              />
            ))
          )}
        </g>
      </svg>
    </div>
  );
};
