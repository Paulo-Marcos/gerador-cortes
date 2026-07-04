import React from "react";
import { COLORS_V2 as C } from "../../theme-v2";

interface Props {
  size?: number;
  color?: string;
  children?: React.ReactNode;
}

/** Caixa quadrada com borda branca para ícones. */
export const IconBox: React.FC<Props> = ({
  size = 90,
  color = C.branco,
  children,
}) => (
  <div
    style={{
      width: size,
      height: size,
      border: "5px solid rgba(235,245,235,0.92)",
      background: "rgba(8,18,12,0.78)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      boxShadow:
        "0 6px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
      color,
    }}
  >
    {children}
  </div>
);
