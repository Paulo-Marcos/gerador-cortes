import React from "react";
import { COLORS_V2 as C, FONTS_V2 as F } from "../../theme-v2";

interface Props {
  text: string;
  size?: number;
  color?: string;
  letterSpacing?: number;
  weight?: 400 | 500 | 600 | 700;
}

/** Label em IBM Plex Mono caixa alta com letter-spacing pronunciado. */
export const MonoLabel: React.FC<Props> = ({
  text,
  size = 24,
  color,
  letterSpacing = 4,
  weight = 600,
}) => (
  <span
    style={{
      fontFamily: F.mono,
      fontSize: `calc(${size}px * var(--font-scale, 1))`,
      fontWeight: weight,
      letterSpacing,
      color: color ?? C.azulAcento,
      textTransform: "uppercase",
    }}
  >
    {text}
  </span>
);
