import { z } from "zod";
import { cenaSchema } from "./schema";

// Manter sincronizado com FONT_PRESETS_V2 (theme-v2.ts) e FONTE_PRESETS_VALIDOS
// no backend (pipeline_render.py). Se o backend mandar um valor fora desta lista,
// o .default("atual") engole silenciosamente — F-036 corrigiu isso adicionando os
// presets novos aqui.
const fontPresetEnum = z.enum([
  "atual",
  "moderna",
  "cientifica",
  "minimalista",
  "tecnica",
]);

// ─── Schema para renderização de overlay isolado (sem vídeo de fundo) ──────
// O Remotion renderiza APENAS os elementos visuais (texto, mascote, animações)
// sobre fundo transparente. O FFmpeg compõe depois sobre o vídeo tratado.

export const overlaySchema = z.object({
  /** A cena a renderizar (mesma estrutura do CenaYouTube) */
  cena: cenaSchema,
  /** Duração em frames (fps * duração em segundos) */
  durationFrames: z.number().min(1),
  /** Sombra default (cenas v2): nenhuma/leve/media/forte. Cena pode sobrescrever. */
  sombraNivelPadrao: z.enum(["nenhuma", "leve", "media", "forte"]).default("nenhuma"),
  /** Layout default dos cards v2. Cena pode sobrescrever via layout_card. */
  layoutCardPadrao: z.enum(["horizontal", "vertical"]).default("vertical"),
  /** Preset tipografico default dos cards/cenas v2. */
  fontPreset: fontPresetEnum.default("atual"),
});

export type OverlayProps = z.infer<typeof overlaySchema>;

export const overlayTimelineSchema = z.object({
  /** Cenas ja normalizadas com inicio/fim relativos ao chunk */
  cenas: z.array(cenaSchema),
  /** Duracao total do chunk em frames */
  durationFrames: z.number().min(1),
  /** Sombra default (cenas v2): nenhuma/leve/media/forte. Cena pode sobrescrever. */
  sombraNivelPadrao: z.enum(["nenhuma", "leve", "media", "forte"]).default("nenhuma"),
  /** Layout default dos cards v2. Cena pode sobrescrever via layout_card. */
  layoutCardPadrao: z.enum(["horizontal", "vertical"]).default("vertical"),
  /** Preset tipografico default dos cards/cenas v2. */
  fontPreset: fontPresetEnum.default("atual"),
});

export type OverlayTimelineProps = z.infer<typeof overlayTimelineSchema>;
