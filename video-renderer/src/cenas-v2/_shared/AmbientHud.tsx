import React from "react";
import { COLORS_V2 as C } from "../../theme-v2";

interface Props {
  /** Intensidade global do HUD (0..1). Default 1 — usar 0.4–0.6 para
   *  cenas onde o conteúdo é o foco e o HUD deve ficar mais sutil. */
  intensity?: number;
  /** Quais elementos do HUD ambiente exibir. Por default mostra todos. */
  grid?: boolean;
  ringsTL?: boolean;
  semiCirclesTR?: boolean;
  dotsTR?: boolean;
  scanline?: boolean;
  vignette?: boolean;
}

/**
 * Camada de textura ambiente — grid de linhas finas + anéis concêntricos no
 * canto superior esquerdo + semicírculos no superior direito + scanline
 * horizontal central. Posicionada absoluta cobrindo toda a tela; deve
 * ficar ATRÁS do conteúdo (z-index baixo).
 *
 * Garante que toda cena tenha a "assinatura visual" da nova identidade
 * mesmo quando não há Chrome envolvendo o conteúdo.
 */
export const AmbientHud: React.FC<Props> = ({
  intensity = 1,
  grid = true,
  ringsTL = true,
  semiCirclesTR = true,
  dotsTR = false,
  scanline = true,
  vignette = true,
}) => {
  // Opacities das linhas — bem mais nítidas. Em intensity=1 (sombra forte)
  // grid/circles/dots ficam quase 100% visíveis, dando a "textura" plena.
  const opG = 0.85 * intensity;
  const opR = 0.95 * intensity;
  const opS = 0.95 * intensity;
  const opD = 0.9 * intensity;
  const opSc = 0.55 * intensity;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* Grade fina H/V */}
      {grid && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: opG,
            backgroundImage: `
              linear-gradient(rgba(155,207,227,0.30) 1px, transparent 1px),
              linear-gradient(90deg, rgba(155,207,227,0.30) 1px, transparent 1px)
            `,
            backgroundSize: "160px 160px",
          }}
        />
      )}

      {/* Anéis concêntricos TL */}
      {ringsTL && (
        <svg
          width={460}
          height={460}
          viewBox="0 0 460 460"
          style={{
            position: "absolute",
            top: -80,
            left: -80,
            opacity: opR,
          }}
        >
          <g stroke="rgba(155,207,227,0.9)" fill="none" strokeWidth="1.6">
            <circle cx="0" cy="0" r="240" />
            <circle cx="0" cy="0" r="310" />
            <circle cx="0" cy="0" r="380" />
            <circle cx="0" cy="0" r="450" />
          </g>
        </svg>
      )}

      {/* Semicírculos TR */}
      {semiCirclesTR && (
        <svg
          width={520}
          height={400}
          viewBox="0 0 520 400"
          preserveAspectRatio="xMaxYMin meet"
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            opacity: opS,
          }}
        >
          <g stroke="rgba(155,207,227,0.92)" fill="none" strokeWidth="1.4">
            <circle cx="520" cy="0" r="240" />
            <circle cx="520" cy="0" r="310" />
            <circle cx="520" cy="0" r="380" />
            {/* <circle cx="520" cy="0" r="450" /> */}
          </g>
        </svg>
      )}

      {/* Matriz de dots TR (sutil) */}
      {dotsTR && (
        <svg
          width={360}
          height={240}
          viewBox="0 0 360 240"
          style={{
            position: "absolute",
            top: 40,
            right: 40,
            opacity: opD,
          }}
        >
          <g fill="rgba(155,207,227,0.92)">
            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 12 }).map((__, col) => (
                <circle
                  key={`${row}-${col}`}
                  cx={20 + col * 28}
                  cy={30 + row * 28}
                  r="2.2"
                />
              ))
            )}
          </g>
        </svg>
      )}

      {/* Scanline horizontal central */}
      {scanline && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 140,
            transform: "translateY(-50%)",
            background: `linear-gradient(to bottom,
              transparent 0%,
              ${C.azulSoft} 50%,
              transparent 100%)`,
            opacity: opSc,
          }}
        />
      )}

      {/* Tint colorido + escurecimento global escalados por intensity.
          Em "forte" cobre o vídeo razoavelmente sem perder o fundo;
          em "nenhuma" some completamente. */}
      {vignette && intensity > 0.02 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `
              radial-gradient(ellipse at 30% 40%, rgba(42,58,50,${0.55 * intensity}) 0%, transparent 60%),
              radial-gradient(ellipse at 75% 70%, rgba(58,40,32,${0.45 * intensity}) 0%, transparent 60%),
              radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(8,12,10,${0.7 * intensity}) 100%)
            `,
          }}
        />
      )}
    </div>
  );
};
