import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { OverlayTimelineProps } from "./overlay-schema";
import { FrameOffsetContext } from "./frame-context";
import { renderCenaV2 } from "./cenas-v2";
import { normalizarCenaRemotion } from "./schema";
import { CardLayoutContext, FontPresetProvider, SombraContext } from "./cenas-v2/_shared";
import { SharedCardZoneFrame } from "./shared-card-zone";

/**
 * Versão v2 do OverlayTimeline — sequência de cenas sobre fundo transparente,
 * usando a nova identidade visual. Cada cena vira uma `<Sequence>` com seu
 * próprio offset temporal.
 */
export const OverlayTimelineV2: React.FC<OverlayTimelineProps> = ({
  cenas,
  sombraNivelPadrao,
  layoutCardPadrao,
  fontPreset,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <FontPresetProvider preset={fontPreset}>
        <SombraContext.Provider value={sombraNivelPadrao}>
          <CardLayoutContext.Provider value={layoutCardPadrao}>
            {cenas.map((cena, index) => {
              const cenaNormalizada = normalizarCenaRemotion(cena);
              const from = Math.max(0, Math.round(cenaNormalizada.inicio * fps));
              const durationInFrames = Math.max(
                1,
                Math.round((cenaNormalizada.fim - cenaNormalizada.inicio) * fps)
              );

              return (
                <Sequence
                  key={`${index}-${cena.tipo}-${from}`}
                  from={from}
                  durationInFrames={durationInFrames}
                  premountFor={Math.min(from, fps)}
                >
                  <FrameOffsetContext.Provider value={from}>
                    <SharedCardZoneFrame cena={cenaNormalizada}>
                      {renderCenaV2(cenaNormalizada)}
                    </SharedCardZoneFrame>
                  </FrameOffsetContext.Provider>
                </Sequence>
              );
            })}
          </CardLayoutContext.Provider>
        </SombraContext.Provider>
      </FontPresetProvider>
    </AbsoluteFill>
  );
};
