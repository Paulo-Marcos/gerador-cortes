import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { CamadaShort } from "./index";
import { TIPOS_CENA_SHORT } from "./schema";

// D-466: a composição que o render do short desenha.
//
// Ela produz SÓ A CAMADA — cenas e legenda sobre fundo transparente — e não o
// vídeo. O vídeo é recortado, reenquadrado e gradado pelo FFmpeg antes, e a
// camada entra por cima depois.
//
// Poderia ser tudo numa composição só, com o vídeo dentro do Remotion. Não é,
// por dois motivos: o pipeline horizontal já resolve overlay assim (código,
// worker e diagnóstico existentes valem para os dois), e a grade tem de rodar
// ANTES do texto — filtro aplicado depois mexeria na cor da legenda, que já foi
// desenhada certa.

export const cenaShortSchema = z.object({
  tipo: z.enum(TIPOS_CENA_SHORT as unknown as [string, ...string[]]),
  inicio: z.number(),
  fim: z.number(),
  texto: z.string(),
  apoio: z.string().optional(),
});

export const captionShortSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
});

export const ganchoShortSchema = z.object({
  texto: z.string(),
  ateSeg: z.number(),
});

export const camadaShortSchema = z.object({
  cenas: z.array(cenaShortSchema),
  /** D-565: o gancho da abertura. `null` = este short nao tem, que e o comum. */
  gancho: ganchoShortSchema.nullable().default(null),
  captions: z.array(captionShortSchema),
  /** D-563: hex da palavra corrente da legenda. "" = o acento do canal. */
  legendaCor: z.string().default(""),
  /** Duração do short em segundos — define o tamanho da composição. */
  duracaoSeg: z.number(),
});

export type CamadaShortSchema = z.infer<typeof camadaShortSchema>;

export const CamadaShortComposition: React.FC<CamadaShortSchema> = ({
  cenas,
  captions,
  gancho,
  legendaCor,
}) => (
  // Fundo transparente: o alpha é o produto desta composição.
  <AbsoluteFill style={{ backgroundColor: "transparent" }}>
    <CamadaShort
      cenas={cenas as CamadaShortSchema["cenas"] as never}
      captions={captions as never}
      gancho={gancho ?? null}
      legendaCor={legendaCor}
    />
  </AbsoluteFill>
);
