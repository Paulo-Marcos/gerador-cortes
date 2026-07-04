import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig, Sequence } from "remotion";
import { z } from "zod";

export const shortViralSchema = z.object({
  videoUrl: z.string(),
  inicio_seg: z.number().default(0), 
  fim_seg: z.number().default(60),
  captions: z.array(z.object({
    text: z.string(),
    startMs: z.number(),
    endMs: z.number(),
    timestampMs: z.number().nullable().optional(),
    confidence: z.number().nullable().optional()
  })).default([]),
  cenas_remotion: z.array(z.any()).default([])
});

export type ShortViralProps = z.infer<typeof shortViralSchema>;

export const CenaShortViral: React.FC<ShortViralProps> = ({
  videoUrl,
  inicio_seg,
  fim_seg,
  captions
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Prepara as legendas no estilo TikTok (agrupando por páginas)
  const { pages } = React.useMemo(() => {
    // Importante: no ambiente de build o createTikTokStyleCaptions precisa estar disponível
    // Como Remotion e React estão no escopo global, podemos exigir via require para evitar erros de tipagem
    const { createTikTokStyleCaptions } = require("@remotion/captions");
    return createTikTokStyleCaptions({
      captions: captions as any,
      combineTokensWithinMilliseconds: 1500, // Cada página dura aprox 1.5 seg (3-5 palavras)
    });
  }, [captions]);

  // Se o short for apenas um pedaço do clip_raw, podemos calcular o tempo atual relativo
  const currentTime = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      
      {/* 
        Aqui está o segredo do 9:16 Estático:
        O vídeo original é 16:9. Colocamos objectFit="cover" em um contêiner 9:16.
        Isso faz um "Crop Central" automático focado no centro do vídeo.
      */}
      <AbsoluteFill>
        <OffthreadVideo 
          src={videoUrl} 
          // O `startFrom` permite pular para a parte exata do short caso o videoUrl seja o clipe completo
          // Se o backend enviar um videoUrl já cortado (só os 30s), inicio_seg seria 0.
          startFrom={Math.round(inicio_seg * fps)}
          style={{ 
            width: "100%", 
            height: "100%", 
            objectFit: "cover" 
          }} 
        />
      </AbsoluteFill>



      {/* Renderização das Páginas de Legenda */}
      <AbsoluteFill>
        {pages.map((page: any, index: number) => {
          const nextPage = pages[index + 1] ?? null;
          const startFrame = (page.startMs / 1000) * fps;
          const endFrame = Math.min(
            nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
            startFrame + (1500 / 1000) * fps,
          );
          const durationInFrames = Math.max(1, endFrame - startFrame); // Evita durations <= 0
          
          if (durationInFrames <= 0) return null;

          return (
            <Sequence
              key={index}
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <CaptionPage page={page} />
            </Sequence>
          );
        })}
      </AbsoluteFill>

    </AbsoluteFill>
  );
};

// Sub-componente para renderizar uma "página" (linha de texto) com Word Highlighting
const HIGHLIGHT_COLOR = "#00FFDD"; // Verde água neon (viral)
const TEXT_COLOR = "#FFFFFF";

const CaptionPage: React.FC<{ page: any }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calcula o tempo absoluto atual desta Sequence
  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", top: "25%" }}>
      <div style={{ 
        fontSize: 85, 
        fontWeight: "900", 
        fontFamily: "'Inter', sans-serif",
        textAlign: "center",
        lineHeight: 1.2,
        width: "90%",
        textTransform: "uppercase",
        WebkitTextStroke: "4px black", // Borda preta grossa (TikTok style)
        textShadow: "6px 6px 0px rgba(0,0,0,1)" // Sombra sólida
      }}>
        {page.tokens.map((token: any) => {
          // A palavra está sendo falada exatamente agora?
          const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

          return (
            <span
              key={token.fromMs}
              style={{ 
                color: isActive ? HIGHLIGHT_COLOR : TEXT_COLOR,
                display: "inline-block",
                transform: isActive ? "scale(1.1)" : "scale(1)", // Dá um pulinho na palavra
                transition: "transform 0.1s ease-out",
                // Manter o whitespace usando 'pre' pois recebemos " Palavra" do json
                whiteSpace: "pre-wrap"
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
