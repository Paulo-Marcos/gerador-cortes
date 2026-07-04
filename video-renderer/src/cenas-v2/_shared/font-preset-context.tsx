import type { CSSProperties, ReactNode } from "react";
import { FONT_PRESETS_V2, type FontPresetV2 } from "../../theme-v2";

export type FontPreset = FontPresetV2;

const DEFAULT_FONT_PRESET: FontPreset = "atual";

export const normalizarFontPreset = (value: unknown): FontPreset => {
  if (typeof value === "string" && value in FONT_PRESETS_V2) {
    return value as FontPreset;
  }
  return DEFAULT_FONT_PRESET;
};

export const FontPresetProvider = ({
  preset,
  children,
}: {
  preset?: FontPreset | string;
  children: ReactNode;
}) => {
  const fonts = FONT_PRESETS_V2[normalizarFontPreset(preset)];
  const style = {
    position: "absolute",
    inset: 0,
    "--font-display-v2": fonts.display,
    "--font-serif-v2": fonts.serif,
    "--font-serif-italic-v2": fonts.serifItalic,
    "--font-mono-v2": fonts.mono,
  } as CSSProperties;

  return <div style={style}>{children}</div>;
};
