/**
 * Identidade Visual v2 — "Nova Identidade Editorial"
 *
 * Paleta verde-moldura + azul-acento, com presets tipograficos para testar
 * leituras diferentes nos cards/cenas v2. Mantido em paralelo a `theme.ts` durante a transição —
 * apenas as cenas redesenhadas em `cenas-v2/` consomem este módulo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";

import themeConfig from "../theme.config.json";

// F-036: 5 presets tipograficos com stacks 100% distintos
// (display + serif + mono diferentes em cada preset) para que a troca
// de fonte se reflita em titulos, citacoes e tags ao mesmo tempo.
//
// D-642: as 14 chamadas de `loadFont()` ficavam aqui no topo do modulo e
// rodavam SEMPRE, em todo render. Cada peso x subset x estilo abre um download
// na gstatic e prende o render com um `delayRender` proprio: eram ~124
// downloads por processo para usar os ~30 do preset escolhido, e cada um deles
// uma chance a mais de estourar o timeout. O `import` continua aqui — o nome da
// familia e uma constante e nao custa rede; quem dispara o download e
// `carregarFontesDoPreset`, com o preset que a cena pediu.
import {
  fontFamily as familiaSpaceGrotesk,
  loadFont as loadSpaceGrotesk,
} from "@remotion/google-fonts/SpaceGrotesk";
import {
  fontFamily as familiaSourceSerif4,
  loadFont as loadSourceSerif4,
} from "@remotion/google-fonts/SourceSerif4";
import {
  fontFamily as familiaIBMPlexMono,
  loadFont as loadIBMPlexMono,
} from "@remotion/google-fonts/IBMPlexMono";
import {
  fontFamily as familiaInter,
  loadFont as loadInter,
} from "@remotion/google-fonts/Inter";
import {
  fontFamily as familiaLora,
  loadFont as loadLora,
} from "@remotion/google-fonts/Lora";
import {
  fontFamily as familiaIBMPlexSans,
  loadFont as loadIBMPlexSans,
} from "@remotion/google-fonts/IBMPlexSans";
import {
  fontFamily as familiaIBMPlexSerif,
  loadFont as loadIBMPlexSerif,
} from "@remotion/google-fonts/IBMPlexSerif";
import {
  fontFamily as familiaDMSerifText,
  loadFont as loadDMSerifText,
} from "@remotion/google-fonts/DMSerifText";
import {
  fontFamily as familiaDMSans,
  loadFont as loadDMSans,
} from "@remotion/google-fonts/DMSans";
import {
  fontFamily as familiaRoboto,
  loadFont as loadRoboto,
} from "@remotion/google-fonts/Roboto";
import {
  fontFamily as familiaRobotoSerif,
  loadFont as loadRobotoSerif,
} from "@remotion/google-fonts/RobotoSerif";
import {
  fontFamily as familiaRobotoMono,
  loadFont as loadRobotoMono,
} from "@remotion/google-fonts/RobotoMono";
import {
  fontFamily as familiaJetBrainsMono,
  loadFont as loadJetBrainsMono,
} from "@remotion/google-fonts/JetBrainsMono";
import {
  fontFamily as familiaSpaceMono,
  loadFont as loadSpaceMono,
} from "@remotion/google-fonts/SpaceMono";

const fontVar = (name: string, fallback: string) => `var(${name}, ${fallback})`;

/** As quatro vozes de um preset: titulo, texto, citacao e etiqueta. */
export interface FamiliasDoPreset {
  display: string;
  serif: string;
  serifItalic: string;
  mono: string;
}

interface ReceitaDePreset {
  familias: FamiliasDoPreset;
  /** Dispara os downloads deste preset; uma promessa por variacao pedida. */
  baixar: () => Promise<unknown>[];
}

// Os pesos e subsets de cada chamada sao os MESMOS de antes da D-642, escritos
// literais de novo porque o tipo do pacote so aceita os pesos que aquela
// familia realmente tem. Mudar um numero aqui muda o desenho do texto.
const RECEITAS = {
  // --- Preset "atual" (default historico) ---
  atual: {
    familias: {
      display: familiaSpaceGrotesk,
      serif: familiaSourceSerif4,
      serifItalic: familiaSourceSerif4,
      mono: familiaIBMPlexMono,
    },
    baixar: () => [
      loadSpaceGrotesk("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadSourceSerif4("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadSourceSerif4("italic", {
        weights: ["400", "500", "600"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadIBMPlexMono("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
    ],
  },

  // --- Preset "moderna": Inter + Lora + JetBrains Mono ---
  moderna: {
    familias: {
      display: familiaInter,
      serif: familiaLora,
      serifItalic: familiaLora,
      mono: familiaJetBrainsMono,
    },
    baixar: () => [
      loadInter("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadLora("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadLora("italic", {
        weights: ["400", "500", "600"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadJetBrainsMono("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
    ],
  },

  // --- Preset "cientifica": familia IBM Plex coerente ---
  cientifica: {
    familias: {
      display: familiaIBMPlexSans,
      serif: familiaIBMPlexSerif,
      serifItalic: familiaIBMPlexSerif,
      mono: familiaIBMPlexMono,
    },
    baixar: () => [
      loadIBMPlexSans("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadIBMPlexSerif("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadIBMPlexSerif("italic", {
        weights: ["400", "500", "600"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadIBMPlexMono("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
    ],
  },

  // --- Preset "minimalista": DM Sans + DM Serif Text + Space Mono ---
  minimalista: {
    familias: {
      display: familiaDMSans,
      serif: familiaDMSerifText,
      serifItalic: familiaDMSerifText,
      mono: familiaSpaceMono,
    },
    baixar: () => [
      loadDMSans("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadDMSerifText("normal", {
        weights: ["400"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadDMSerifText("italic", {
        weights: ["400"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadSpaceMono("normal", {
        weights: ["400", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
    ],
  },

  // --- Preset "tecnica": familia Roboto coerente ---
  tecnica: {
    familias: {
      display: familiaRoboto,
      serif: familiaRobotoSerif,
      serifItalic: familiaRobotoSerif,
      mono: familiaRobotoMono,
    },
    baixar: () => [
      loadRoboto("normal", {
        weights: ["400", "500", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadRobotoSerif("normal", {
        weights: ["400", "500", "600", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadRobotoSerif("italic", {
        weights: ["400", "500", "600"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
      loadRobotoMono("normal", {
        weights: ["400", "500", "700"],
        subsets: ["latin", "latin-ext"],
      }).waitUntilDone(),
    ],
  },
} satisfies Record<string, ReceitaDePreset>;

export type FontPresetV2 = keyof typeof RECEITAS;

// Cada preset varia display + serif + serifItalic + mono para que a troca
// se refleta em titulos, citacoes/legendas e tags ao mesmo tempo. Antes da
// F-036 o mono era sempre IBM Plex Mono — por isso os labels pequenos
// pareciam "nao mudar".
export const FONT_PRESETS_V2: Record<FontPresetV2, FamiliasDoPreset> = {
  atual: RECEITAS.atual.familias,
  moderna: RECEITAS.moderna.familias,
  cientifica: RECEITAS.cientifica.familias,
  minimalista: RECEITAS.minimalista.familias,
  tecnica: RECEITAS.tecnica.familias,
};

const emVoo = new Map<FontPresetV2, Promise<void>>();

/**
 * Baixa as familias de UM preset — uma vez so por processo de render.
 *
 * O proprio `@remotion/google-fonts` ja guarda cada variacao ja pedida, entao
 * repetir a chamada e barato; o mapa aqui existe para que duas cenas irmas
 * compartilhem a MESMA promessa e, com ela, o mesmo instante de "pronto".
 */
export function carregarFontesDoPreset(preset: FontPresetV2): Promise<void> {
  const jaPedido = emVoo.get(preset);
  if (jaPedido) return jaPedido;

  const promessa = Promise.all(RECEITAS[preset].baixar()).then(() => undefined);
  emVoo.set(preset, promessa);
  return promessa;
}

const fontesDoNavegadorProntas = (): Promise<unknown> =>
  typeof document !== "undefined" && document.fonts
    ? document.fonts.ready
    : Promise.resolve();

/**
 * Segura a foto do Remotion ate a fonte chegar — e avisa quem mede texto.
 *
 * D-642: o `delayRender` que o `loadFont` ja cria adia a CAPTURA, nao a
 * MONTAGEM. O React monta na hora, o `useLayoutEffect` do `AutoFitText` mede o
 * texto com a fonte de fallback, escolhe um `--font-scale` por essa medida — e
 * ninguem remede quando a letra definitiva chega. Dai o texto "pular" entre um
 * pedaco e outro. Por isso o booleano devolvido aqui entra nas dependencias de
 * quem mede: quando vira `true`, a medida refaz com a letra certa, e so depois
 * disso a foto e liberada.
 */
export function useEsperarFontes(
  rotulo: string,
  carregar: () => Promise<void>,
): boolean {
  const [handle] = useState(() =>
    delayRender(rotulo, { timeoutInMilliseconds: 60000 }),
  );
  const [prontas, setProntas] = useState(false);
  const soltou = useRef(false);

  const soltar = useCallback(() => {
    if (soltou.current) return;
    soltou.current = true;
    continueRender(handle);
  }, [handle]);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then(fontesDoNavegadorProntas)
      // O `loadFont` ja tenta de novo sozinho. Se ainda assim falhar, e melhor
      // desenhar com a fonte de fallback do que pendurar o render ate o timeout.
      .catch(() => undefined)
      .then(() => {
        if (vivo) setProntas(true);
      });
    return () => {
      vivo = false;
    };
  }, [carregar]);

  // Solta DEPOIS do re-layout: o `useLayoutEffect` de quem mede roda no commit,
  // antes deste `useEffect`. Entao a foto ja sai com a medida refeita.
  useEffect(() => {
    if (prontas) soltar();
  }, [prontas, soltar]);

  // Desmontou antes de a fonte chegar: soltar, senao o render fica pendurado.
  useEffect(() => soltar, [soltar]);

  return prontas;
}

/** Espera as fontes do preset que esta cena pediu. */
export function useFontesDoPreset(preset: FontPresetV2): boolean {
  const carregar = useCallback(() => carregarFontesDoPreset(preset), [preset]);
  return useEsperarFontes(`Fontes do preset "${preset}"`, carregar);
}

export const FONTS_V2 = {
  display: fontVar("--font-display-v2", RECEITAS.atual.familias.display),
  serif: fontVar("--font-serif-v2", RECEITAS.atual.familias.serif),
  serifItalic: fontVar(
    "--font-serif-italic-v2",
    RECEITAS.atual.familias.serifItalic,
  ),
  mono: fontVar("--font-mono-v2", RECEITAS.atual.familias.mono),
};

// D-174: o TEMA do canal é o conjunto COMPLETO de cores. Cada chave vem do
// `theme.config.json` (materializado por canal), com FALLBACK ao literal histórico
// para configs legadas que só trazem as 6 cores base — assim o default (e qualquer
// canal ainda não migrado) renderiza pixel-idêntico ao estado pré-D-174.
const palette = themeConfig.palette as Partial<Record<string, string>>;
const cor = (chave: string, fallback: string): string => palette[chave] ?? fallback;

/** A mesma cor do tema com outra opacidade (D-633). Os brilhos, grades e
 *  molduras das cenas usavam o RGB do tema padrão escrito à mão, então trocar o
 *  tema do canal não chegava neles. Aceita `#rrggbb` e `rgb()/rgba()`. */
export function comAlfa(cor: string, alfa: number): string {
  const valor = cor.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(valor);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(valor);
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alfa})`;
  return valor;
}

export const COLORS_V2 = {
  // Verdes — assinatura da moldura
  verdeMoldura: cor("verdeMoldura", "#6aaa84"),
  verdeProfundo: cor("verdeProfundo", "#1a221c"),
  verdeCard1: cor("verdeCard1", "rgba(44, 68, 56, 0.96)"),
  verdeCard2: cor("verdeCard2", "rgba(36, 58, 48, 0.92)"),
  verdeCard3: cor("verdeCard3", "rgba(28, 42, 34, 0.55)"),
  verdeCard4: cor("verdeCard4", "rgba(18, 26, 22, 0.25)"),

  marromQuente: cor("marromQuente", "#3c2a22"),

  // Azul acento (HUD / destaque)
  azulAcento: cor("azulAcento", "#9bcfe3"),
  azulSoft: cor("azulSoft", "rgba(150, 205, 235, 0.42)"),
  azulGhost: cor("azulGhost", "rgba(150, 205, 235, 0.09)"),

  // Texto
  branco: cor("branco", "#ffffff"),
  brancoMuted: cor("brancoMuted", "rgba(255, 255, 255, 0.85)"),
  brancoDim: cor("brancoDim", "rgba(255, 255, 255, 0.55)"),

  // Contornos
  linha: cor("linha", "rgba(235, 245, 235, 0.92)"),
  linhaSoft: cor("linhaSoft", "rgba(235, 245, 235, 0.40)"),
  linhaGhost: cor("linhaGhost", "rgba(255, 255, 255, 0.12)"),

  // Backdrop
  fundoPalco: cor("fundoPalco", "#0f1410"),
};

export const SHADOWS_V2 = {
  // Card com sombra ampla — duas camadas: uma próxima/dura para borda
  // definida, outra ampla/difusa para o halo escurecido em volta do card.
  // Substitui parcialmente o palco gradient quando o card não usa palco.
  cardElevado:
    "0 12px 28px rgba(0,0,0,0.65), 0 36px 90px rgba(0,0,0,0.55)",
  textoSobreVideo:
    "0 3px 8px rgba(0,0,0,0.75), 0 1px 0 rgba(0,0,0,0.5)",
  glowMoldura: `0 0 30px ${comAlfa(COLORS_V2.verdeMoldura, 0.4)}`,
  glowAcento: `0 0 30px ${comAlfa(COLORS_V2.azulAcento, 0.5)}`,
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
