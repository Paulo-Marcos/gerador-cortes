import React from "react";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../../theme-v2";

export type RichTitlePart =
  | string
  | { highlight: string }
  | { italic: string }
  | { editorial: string }
  | { break: true };

interface Props {
  parts: RichTitlePart[];
  size?: number;
  color?: string;
  maxWidth?: number | string;
}

/**
 * Título em Space Grotesk com partes mistas:
 *  - `string`        → texto neutro (uppercase)
 *  - `{highlight}`   → azul acento
 *  - `{italic}`      → Instrument Serif italic, lowercase, peso 400
 *  - `{editorial}`   → "?" / pontuação editorial em serif italic, azul acento
 *  - `{break: true}` → quebra de linha
 */
export const RichTitle: React.FC<Props> = ({
  parts,
  size = 74,
  color = "#fff",
  maxWidth,
}) => (
  <div
    style={{
      fontFamily: F.display,
      fontSize: `calc(${size}px * var(--font-scale, 1))`,
      fontWeight: 900,
      color,
      lineHeight: 1.04,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      textShadow: SH.textoSobreVideo,
      maxWidth,
    }}
  >
    {parts.map((p, i) => {
      if (p === null || p === undefined) return null;
      if (typeof p === "string") {
        return (
          <React.Fragment key={i}>
            {i > 0 && " "}
            {p}
          </React.Fragment>
        );
      }
      const space = i > 0 ? " " : "";
      if ("highlight" in p) {
        return (
          <React.Fragment key={i}>
            {space}
            <span style={{ color: C.azulAcento }}>{p.highlight}</span>
          </React.Fragment>
        );
      }
      if ("italic" in p) {
        return (
          <React.Fragment key={i}>
            {space}
            <span
              style={{
                fontFamily: F.serifItalic,
                fontStyle: "italic",
                fontWeight: 400,
                textTransform: "lowercase",
                letterSpacing: "-0.01em",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {p.italic}
            </span>
          </React.Fragment>
        );
      }
      if ("editorial" in p) {
        return (
          <span
            key={i}
            style={{
              fontFamily: F.serifItalic,
              fontStyle: "italic",
              fontWeight: 400,
              textTransform: "none",
              color: C.azulAcento,
              marginLeft: 6,
              fontSize: "1.05em",
              display: "inline-block",
              transform: "translateY(0.08em)",
            }}
          >
            {p.editorial}
          </span>
        );
      }
      if ("break" in p) return <br key={i} />;
      return null;
    })}
  </div>
);
