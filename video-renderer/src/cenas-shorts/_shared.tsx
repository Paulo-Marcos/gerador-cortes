import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CenaShort } from "./schema";

// D-465: o pouco que as quatro cenas verticais compartilham.
//
// Vertical não é o horizontal girado. Três coisas mudam de verdade:
//
//   1. **Safe zone.** Topo e base pertencem à UI dos apps (perfil, legenda,
//      botões). Conteúdo ali é conteúdo que ninguém lê.
//   2. **Corpo de texto.** O short é assistido na mão, muitas vezes em
//      movimento: o que era confortável em 1080p de monitor é ilegível aqui.
//      Os tamanhos saem da ALTURA do quadro, não de pixels fixos.
//   3. **Duração.** Cena de short vive 2 a 4 segundos. A entrada tem de
//      terminar rápido ou o espectador vê só a animação, nunca o conteúdo.

/** Fração da altura reservada à UI dos apps, em cima e embaixo. */
export const SAFE_ZONE = 0.18;

/** Frames de entrada/saída. Curto de propósito: 8 frames a 30fps = 0,27s. */
const FRAMES_FADE = 8;

export interface CenaShortProps {
  cena: CenaShort;
}

/** Progresso da cena e opacidade com entrada/saída suaves. */
export function useCenaShort(cena: CenaShort) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();

  const frameLocal = frame - cena.inicio * fps;
  const duracao = Math.max(1, (cena.fim - cena.inicio) * fps);

  const entrada = interpolate(frameLocal, [0, FRAMES_FADE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const saida = interpolate(frameLocal, [duracao - FRAMES_FADE, duracao], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return {
    opacity: Math.min(entrada, saida),
    entrada,
    height,
    width,
    /** Corpo de texto derivado da altura do quadro (nunca pixel fixo). */
    corpo: (fracao: number) => Math.round(height * fracao),
  };
}

/** Moldura comum: safe zone, centralização e o fade da cena. */
export const PalcoShort: React.FC<{
  opacity: number;
  ancora?: "centro" | "topo" | "base";
  children: React.ReactNode;
}> = ({ opacity, ancora = "centro", children }) => (
  <AbsoluteFill
    style={{
      opacity,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent:
        ancora === "topo" ? "flex-start" : ancora === "base" ? "flex-end" : "center",
      paddingTop: `${SAFE_ZONE * 100}%`,
      paddingBottom: `${SAFE_ZONE * 100}%`,
      paddingLeft: "8%",
      paddingRight: "8%",
      textAlign: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Véu escuro sob o texto — contraste sem esconder o vídeo por completo. */
export const Veu: React.FC<{ opacity: number; forca?: number }> = ({
  opacity,
  forca = 0.55,
}) => (
  <AbsoluteFill
    style={{
      opacity,
      background: `linear-gradient(180deg, rgba(0,0,0,${forca}) 0%, rgba(0,0,0,${
        forca * 0.4
      }) 45%, rgba(0,0,0,${forca}) 100%)`,
    }}
  />
);
