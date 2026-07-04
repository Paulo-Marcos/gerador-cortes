/**
 * Identidade Visual v2 — "Nova Identidade Editorial"
 *
 * Paleta verde-moldura + azul-acento, com presets tipograficos para testar
 * leituras diferentes nos cards/cenas v2. Mantido em paralelo a `theme.ts` durante a transição —
 * apenas as cenas redesenhadas em `cenas-v2/` consomem este módulo.
 */

import themeConfig from "../theme.config.json";

// F-036: 5 presets tipograficos com stacks 100% distintos
// (display + serif + mono diferentes em cada preset) para que a troca
// de fonte se reflita em titulos, citacoes e tags ao mesmo tempo.
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadSourceSerif4 } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadIBMPlexMono } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadIBMPlexSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadIBMPlexSerif } from "@remotion/google-fonts/IBMPlexSerif";
import { loadFont as loadDMSerifText } from "@remotion/google-fonts/DMSerifText";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadRobotoSerif } from "@remotion/google-fonts/RobotoSerif";
import { loadFont as loadRobotoMono } from "@remotion/google-fonts/RobotoMono";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";

// --- Preset "atual" (default historico) ---
const display = loadSpaceGrotesk("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const serif = loadSourceSerif4("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const serifItalic = loadSourceSerif4("italic", {
  weights: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});
const mono = loadIBMPlexMono("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

// --- Preset "moderna": Inter + Lora + JetBrains Mono ---
const inter = loadInter("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const lora = loadLora("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const loraItalic = loadLora("italic", {
  weights: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});
const jetbrainsMono = loadJetBrainsMono("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

// --- Preset "cientifica": familia IBM Plex coerente ---
const ibmPlexSans = loadIBMPlexSans("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const ibmPlexSerif = loadIBMPlexSerif("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const ibmPlexSerifItalic = loadIBMPlexSerif("italic", {
  weights: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});

// --- Preset "minimalista": DM Sans + DM Serif Text + Space Mono ---
const dmSans = loadDMSans("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const dmSerifText = loadDMSerifText("normal", {
  weights: ["400"],
  subsets: ["latin", "latin-ext"],
});
const dmSerifTextItalic = loadDMSerifText("italic", {
  weights: ["400"],
  subsets: ["latin", "latin-ext"],
});
const spaceMono = loadSpaceMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "latin-ext"],
});

// --- Preset "tecnica": familia Roboto coerente ---
const roboto = loadRoboto("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
});
const robotoSerif = loadRobotoSerif("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
const robotoSerifItalic = loadRobotoSerif("italic", {
  weights: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});
const robotoMono = loadRobotoMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
});

const fontVar = (name: string, fallback: string) => `var(${name}, ${fallback})`;

// Cada preset varia display + serif + serifItalic + mono para que a troca
// se refleta em titulos, citacoes/legendas e tags ao mesmo tempo. Antes da
// F-036 o mono era sempre IBM Plex Mono — por isso os labels pequenos
// pareciam "nao mudar".
export const FONT_PRESETS_V2 = {
  atual: {
    display: display.fontFamily,
    serif: serif.fontFamily,
    serifItalic: serifItalic.fontFamily,
    mono: mono.fontFamily,
  },
  moderna: {
    display: inter.fontFamily,
    serif: lora.fontFamily,
    serifItalic: loraItalic.fontFamily,
    mono: jetbrainsMono.fontFamily,
  },
  cientifica: {
    display: ibmPlexSans.fontFamily,
    serif: ibmPlexSerif.fontFamily,
    serifItalic: ibmPlexSerifItalic.fontFamily,
    mono: mono.fontFamily,
  },
  minimalista: {
    display: dmSans.fontFamily,
    serif: dmSerifText.fontFamily,
    serifItalic: dmSerifTextItalic.fontFamily,
    mono: spaceMono.fontFamily,
  },
  tecnica: {
    display: roboto.fontFamily,
    serif: robotoSerif.fontFamily,
    serifItalic: robotoSerifItalic.fontFamily,
    mono: robotoMono.fontFamily,
  },
} as const;

export type FontPresetV2 = keyof typeof FONT_PRESETS_V2;

export const FONTS_V2 = {
  display: fontVar("--font-display-v2", display.fontFamily),
  serif: fontVar("--font-serif-v2", serif.fontFamily),
  serifItalic: fontVar("--font-serif-italic-v2", serifItalic.fontFamily),
  mono: fontVar("--font-mono-v2", mono.fontFamily),
};

const { palette } = themeConfig;

export const COLORS_V2 = {
  // Verdes — assinatura da moldura
  verdeMoldura: palette.verdeMoldura,
  verdeProfundo: palette.verdeProfundo,
  verdeCard1: "rgba(44, 68, 56, 0.96)",
  verdeCard2: "rgba(36, 58, 48, 0.92)",
  verdeCard3: "rgba(28, 42, 34, 0.55)",
  verdeCard4: "rgba(18, 26, 22, 0.25)",

  marromQuente: palette.marromQuente,

  // Azul acento (HUD / destaque)
  azulAcento: palette.azulAcento,
  azulSoft: "rgba(150, 205, 235, 0.42)",
  azulGhost: "rgba(150, 205, 235, 0.09)",

  // Texto
  branco: palette.branco,
  brancoMuted: "rgba(255, 255, 255, 0.85)",
  brancoDim: "rgba(255, 255, 255, 0.55)",

  // Contornos
  linha: "rgba(235, 245, 235, 0.92)",
  linhaSoft: "rgba(235, 245, 235, 0.40)",
  linhaGhost: "rgba(255, 255, 255, 0.12)",

  // Backdrop
  fundoPalco: palette.fundoPalco,
};

export const SHADOWS_V2 = {
  // Card com sombra ampla — duas camadas: uma próxima/dura para borda
  // definida, outra ampla/difusa para o halo escurecido em volta do card.
  // Substitui parcialmente o palco gradient quando o card não usa palco.
  cardElevado:
    "0 12px 28px rgba(0,0,0,0.65), 0 36px 90px rgba(0,0,0,0.55)",
  textoSobreVideo:
    "0 3px 8px rgba(0,0,0,0.75), 0 1px 0 rgba(0,0,0,0.5)",
  glowMoldura: "0 0 30px rgba(106,170,132,0.4)",
  glowAcento: "0 0 30px rgba(155,207,227,0.5)",
  // filter helper p/ Img / svg / div
  mascote: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
};

export const Z_V2 = {
  ambiente: 1,
  conteudo: 10,
  mascote: 50,
  cta: 100,
};

/**
 * Geometria dos cantos da moldura "cantonada" — bracket arredondado TL/BL,
 * chanfrado TR/BR. Cresce proporcionalmente à altura.
 */
export interface ChromePathOptions {
  radius?: number;
  chamferTR?: number;
  chamferBR?: number;
}

export interface ChromePaths {
  main: string;
  inner: string;
  bracketTL: string;
  bracketBL: string;
  bracketBR: string;
  bracketTR: string;
  baseR: number;
  cTR: number;
  cBR: number;
}

export function buildChromePaths(
  w: number,
  h: number,
  opts: ChromePathOptions = {}
): ChromePaths {
  const baseR = opts.radius ?? Math.max(12, Math.min(35, h * 0.077));
  const cTR = opts.chamferTR ?? Math.max(20, Math.min(90, h * 0.193));
  const cBR = opts.chamferBR ?? Math.max(10, Math.min(40, h * 0.085));
  const offset = 12;

  const main =
    `M ${baseR},0 L ${w - cTR},0 L ${w},${cTR} L ${w},${h - cBR} L ${w - cBR},${h} L ${baseR},${h} ` +
    `A ${baseR},${baseR} 0 0 1 0,${h - baseR} L 0,${baseR} A ${baseR},${baseR} 0 0 1 ${baseR},0 Z`;

  const innerR = Math.max(2, baseR - offset);
  const inner =
    `M ${baseR},${offset} L ${w - cTR - 6},${offset} L ${w - offset},${cTR + 6} L ${w - offset},${h - cBR - 4} L ${w - cBR - 4},${h - offset} L ${baseR},${h - offset} ` +
    `A ${innerR},${innerR} 0 0 1 ${offset},${h - baseR} L ${offset},${baseR} A ${innerR},${innerR} 0 0 1 ${baseR},${offset} Z`;

  const bkLen = baseR * 3.5;
  const bracketTL = `M ${bkLen},0 L ${baseR},0 A ${baseR},${baseR} 0 0 0 0,${baseR} L 0,${bkLen}`;
  const bracketBL = `M 0,${h - bkLen} L 0,${h - baseR} A ${baseR},${baseR} 0 0 0 ${baseR},${h} L ${bkLen},${h}`;
  const bracketBR =
    `M ${w - cBR - bkLen * 0.8},${h} L ${w - cBR},${h} L ${w},${h - cBR} L ${w},${h - cBR - bkLen * 0.8}`;
  const bracketTR =
    `M ${w - cTR - bkLen * 0.8},0 L ${w - cTR},0 L ${w},${cTR} L ${w},${cTR + bkLen * 0.8}`;

  return { main, inner, bracketTL, bracketBL, bracketBR, bracketTR, baseR, cTR, cBR };
}
