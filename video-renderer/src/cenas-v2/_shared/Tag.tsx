import React from "react";
import { FONTS_V2 as F } from "../../theme-v2";

interface Props {
  text: string;
  height?: number;
  fontSize?: number;
  color?: string;
}

/** Rótulo retangular com borda fina e fundo escuro. */
export const Tag: React.FC<Props> = ({
  text,
  height = 90,
  fontSize,
  color = "rgba(245,250,245,1)",
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: `0 ${height * 0.44}px`,
      border: "5px solid rgba(235,245,235,0.85)",
      background: "rgba(15,30,22,0.5)",
      height,
      boxSizing: "border-box",
      boxShadow:
        "0 6px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}
  >
    <span
      style={{
        fontFamily: F.display,
        fontSize: fontSize ?? height * 0.33,
        fontWeight: 800,
        letterSpacing: 5,
        color,
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      }}
    >
      {text}
    </span>
  </div>
);
