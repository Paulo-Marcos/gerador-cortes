import React from "react";

interface Props {
  width?: number | string;
  color?: string;
}

/** Linha tipo "lente" sob títulos — uma elipse achatada que sugere foco. */
export const LensLine: React.FC<Props> = ({
  width = "81%",
  color = "rgba(255,255,255,0.92)",
}) => (
  <svg
    style={{
      width,
      height: 4,
      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
      display: "block",
    }}
    viewBox="0 0 600 12"
    preserveAspectRatio="none"
  >
    <path d="M 0 6 Q 300 -3 600 6 Q 300 15 0 6 Z" fill={color} />
  </svg>
);
