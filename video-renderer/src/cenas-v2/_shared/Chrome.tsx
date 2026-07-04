import React from "react";
import { COLORS_V2 as C, buildChromePaths } from "../../theme-v2";

export type ChromeHud =
  | "grid"
  | "circles-tl"
  | "semicircles-tr"
  | "dots-tr"
  | "scanline";

export type ChromeVariant = "full" | "slim-l" | "badge-tr" | "all-four";
export type ChromeBackground = "verde" | "limpo" | "none";

interface Props {
  w: number;
  h: number;
  variant?: ChromeVariant;
  bracketColor?: string;
  hud?: ChromeHud[];
  background?: ChromeBackground;
  idSuffix: string;
  cornerRadius?: number;
  showInnerLine?: boolean;
  /** Quando definido entre 0..1, controla a fração horizontal do conteúdo
   *  revelada com clip-path (entrada suave). */
  reveal?: number;
  /** Multiplicador da opacity do background do card (0..1). Default 1.
   *  Não afeta brackets/contorno (esses são "assinatura visual" e ficam
   *  sempre visíveis). 0 = card transparente, vídeo aparece atrás. */
  bgOpacity?: number;
  children?: React.ReactNode;
  gridOpacity?: number;
  ghostStrokeWidth?: number;
  outlineStrokeWidth?: number;
  bracketStrokeWidth?: number;
}

/**
 * Moldura cantonada com brackets nos cantos + opcional HUD interno.
 * Os brackets têm uma textura listrada — o "estilo assinatura" da identidade.
 */
export const Chrome: React.FC<Props> = ({
  w,
  h,
  variant = "full",
  bracketColor = C.verdeMoldura,
  hud = [],
  background = "verde",
  idSuffix,
  cornerRadius,
  showInnerLine = true,
  reveal = 1,
  bgOpacity = 1,
  gridOpacity = 0.22,
  ghostStrokeWidth,
  outlineStrokeWidth,
  bracketStrokeWidth,
  children,
}) => {
  const paths = buildChromePaths(w, h, cornerRadius ? { radius: cornerRadius } : {});
  const showBracketTL = variant !== "badge-tr";
  const showBracketBL = variant === "full" || variant === "all-four";
  const showBracketBR = variant !== "slim-l";
  const showBracketTR = variant === "all-four" || variant === "badge-tr";

  const hasHud = (item: ChromeHud) => hud.indexOf(item) !== -1;

  // Card sempre com fundo cheio. `bgOpacity` agora controla apenas a
  // SOMBRA EXTERNA (drop-shadow ao redor) — não toca no bg do card.
  // Quando sombra é "nenhuma", card sem halo. "Forte" = halo escuro amplo.
  const bgGradient =
    background === "verde"
      ? `
          linear-gradient(90deg,
            rgba(28, 42, 34, 0.96) 0%,
            rgba(28, 42, 34, 0.92) 45%,
            rgba(28, 42, 34, 0.55) 75%,
            rgba(28, 42, 34, 0.25) 100%),
          radial-gradient(circle at 75% 50%, rgba(60,42,34,1) 0%, rgba(15,20,16,1) 60%)
        `
      : background === "limpo"
        ? "linear-gradient(180deg, rgba(20,28,22,0.94) 0%, rgba(12,18,14,0.92) 100%)"
        : "transparent";

  // Drop-shadow externo escalado por bgOpacity. Dupla camada: borda nítida +
  // halo amplo. Em "forte" o card flutua sobre um halo escuro denso; em
  // "nenhuma" sem sombra, card chapado sobre o vídeo.
  const shadowAlpha1 = 0.65 * bgOpacity;
  const shadowAlpha2 = 0.55 * bgOpacity;
  const shadowSpread = 36 + 24 * bgOpacity; // 36 → 60px
  const dropShadow =
    bgOpacity > 0.02
      ? `drop-shadow(0 12px 28px rgba(0,0,0,${shadowAlpha1})) drop-shadow(0 ${shadowSpread}px ${shadowSpread * 2.5}px rgba(0,0,0,${shadowAlpha2}))`
      : "none";

  const revealPct = Math.max(0, Math.min(1, reveal)) * 100;
  const ghostStroke = ghostStrokeWidth ?? Math.max(6, h * 0.025);
  const outlineStroke = outlineStrokeWidth ?? Math.max(2.5, h * 0.008);
  const bracketStroke = bracketStrokeWidth ?? Math.max(10, h * 0.044);

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        filter: background !== "none" ? dropShadow : "none",
      }}
    >
      {/* Corpo / fundo do card — sempre cheio. */}
      {background !== "none" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `path('${paths.main}')`,
            background: bgGradient,
            overflow: "hidden",
          }}
        >
          {hasHud("grid") && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `
                  linear-gradient(rgba(155,207,227,${gridOpacity}) 0.8px, transparent 1px),
                  linear-gradient(90deg, rgba(155,207,227,${gridOpacity}) 0.8px, transparent 1px)
                `,
                backgroundSize: "80px 80px",
              }}
            />
          )}
          {hasHud("scanline") && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "50%",
                height: Math.min(44, h * 0.18),
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            />
          )}
          {hasHud("circles-tl") && (
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: Math.min(320, w * 0.4),
                height: Math.min(260, h * 0.9),
                pointerEvents: "none",
              }}
              viewBox={`0 0 ${Math.min(320, w * 0.4)} ${Math.min(260, h * 0.9)}`}
            >
              <g stroke={`rgba(155,207,227,${gridOpacity})`} fill="none" strokeWidth="1.4">
                <circle cx="0" cy="0" r="60" />
                <circle cx="0" cy="0" r="90" />
                <circle cx="0" cy="0" r="120" />
                {/* <circle cx="0" cy="0" r="235" /> */}
              </g>
            </svg>
          )}
          {(hasHud("semicircles-tr") || hasHud("dots-tr")) && (
            <svg
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: Math.min(560, w * 0.4),
                height: Math.min(300, h * 0.7),
                pointerEvents: "none",
              }}
              viewBox={`0 0 ${Math.min(560, w * 0.4)} ${Math.min(300, h * 0.7)}`}
              preserveAspectRatio="xMaxYMin meet"
            >
              {hasHud("semicircles-tr") && (
                <g stroke={`rgba(155,207,227,${gridOpacity})`} fill="none" strokeWidth="1.4">
                  <circle cx={Math.min(560, w * 0.4)} cy="0" r="60" />
                  <circle cx={Math.min(560, w * 0.4)} cy="0" r="90" />
                  <circle cx={Math.min(560, w * 0.4)} cy="0" r="120" />
                  {/* <circle cx={Math.min(560, w * 0.4)} cy="0" r="170" /> */}
                </g>
              )}
              {hasHud("dots-tr") && (
                <g fill="rgba(155,207,227,0.4)">
                  {Array.from({ length: 3 }).map((_, row) =>
                    Array.from({ length: 6 }).map((__, col) => (
                      <circle
                        key={`${row}-${col}`}
                        cx={20 + col * 28 + 90}
                        cy={30 + row * 28}
                        r="2.0"
                      />
                    ))
                  )}
                </g>
              )}
            </svg>
          )}
        </div>
      )}

      {/* Contorno + moldura com brackets */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
        }}
        viewBox={`0 0 ${w} ${h}`}
      >
        <defs>
          <pattern
            id={`tex-${idSuffix}`}
            patternUnits="userSpaceOnUse"
            width="5"
            height="5"
          >
            <rect width="5" height="5" fill={bracketColor} />
            <line
              x1="0"
              y1="0.8"
              x2="5"
              y2="0.8"
              stroke="rgba(0,0,0,0.32)"
              strokeWidth="1"
            />
            <line
              x1="0"
              y1="3.5"
              x2="5"
              y2="3.5"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="0.7"
            />
          </pattern>
          <filter id={`sh-${idSuffix}`}>
            <feDropShadow dx="0" dy="5" stdDeviation="6" floodOpacity="0.6" />
          </filter>
        </defs>
        <path
          d={paths.main}
          fill="none"
          stroke={C.linhaGhost}
          strokeWidth={ghostStroke}
        />
        <path
          d={paths.main}
          fill="none"
          stroke={C.linha}
          strokeWidth={outlineStroke}
          strokeLinejoin="miter"
        />
        {showInnerLine && (
          <path
            d={paths.inner}
            fill="none"
            stroke={C.linhaSoft}
            strokeWidth="1.4"
            strokeLinejoin="miter"
          />
        )}
        <g
          fill="none"
          stroke={`url(#tex-${idSuffix})`}
          strokeWidth={bracketStroke}
          strokeLinejoin="round"
          filter={`url(#sh-${idSuffix})`}
        >
          {showBracketTL && <path d={paths.bracketTL} />}
          {showBracketBL && <path d={paths.bracketBL} />}
          {showBracketBR && <path d={paths.bracketBR} />}
          {showBracketTR && <path d={paths.bracketTR} />}
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: revealPct < 100
            ? `polygon(0 0, ${revealPct}% 0, ${revealPct}% 100%, 0 100%)`
            : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};
