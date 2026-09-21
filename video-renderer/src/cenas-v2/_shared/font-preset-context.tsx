import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { FONT_PRESETS_V2, useFontesDoPreset, type FontPresetV2 } from "../../theme-v2";

export type FontPreset = FontPresetV2;

const DEFAULT_FONT_PRESET: FontPreset = "atual";

export const normalizarFontPreset = (value: unknown): FontPreset => {
  if (typeof value === "string" && value in FONT_PRESETS_V2) {
    return value as FontPreset;
  }
  return DEFAULT_FONT_PRESET;
};

/**
 * D-642: "a fonte definitiva ja esta no DOM?".
 *
 * Quem mede texto (`AutoFitText`) precisa saber disso, porque a primeira
 * medida acontece com a fonte de fallback e teria de valer para sempre. O
 * default e `true` de proposito: fora de um provider — um teste, um trecho
 * isolado no Studio — ninguem fica esperando um aviso que nao vem.
 */
const FontesProntasContext = createContext(true);

export const useFontesProntas = (): boolean => useContext(FontesProntasContext);

export const FontPresetProvider = ({
  preset,
  children,
}: {
  preset?: FontPreset | string;
  children: ReactNode;
}) => {
  const escolhido = normalizarFontPreset(preset);
  const fonts = FONT_PRESETS_V2[escolhido];
  // Dispara o download DESTE preset (e so dele) e segura a foto ate chegar.
  const prontas = useFontesDoPreset(escolhido);

  const style = {
    position: "absolute",
    inset: 0,
    "--font-display-v2": fonts.display,
    "--font-serif-v2": fonts.serif,
    "--font-serif-italic-v2": fonts.serifItalic,
    "--font-mono-v2": fonts.mono,
  } as CSSProperties;

  return (
    <FontesProntasContext.Provider value={prontas}>
      <div style={style}>{children}</div>
    </FontesProntasContext.Provider>
  );
};
