import { AbsoluteFill, useVideoConfig } from "remotion";
import type { OverlayProps } from "./overlay-schema";
import { FrameOffsetContext } from "./frame-context";
import { normalizarCenaRemotion } from "./schema";
import { renderCenaV2 } from "./cenas-v2";
import { CardLayoutContext, FontPresetProvider, SombraContext } from "./cenas-v2/_shared";
import { SharedCardZoneFrame } from "./shared-card-zone";

/**
 * Versão v2 do OverlayScene — renderiza UMA cena isolada sobre fundo
 * transparente usando a nova identidade visual. WebM/ProRes com alpha
 * para composição via FFmpeg.
 */
export const OverlaySceneV2: React.FC<OverlayProps> = ({
  cena,
  sombraNivelPadrao,
  layoutCardPadrao,
  fontPreset,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  const localCena = {
    ...normalizarCenaRemotion(cena),
    inicio: 0,
    fim: durationInFrames / fps,
  };

  return (
    <AbsoluteFill>
      <FontPresetProvider preset={fontPreset}>
        <SombraContext.Provider value={sombraNivelPadrao}>
          <CardLayoutContext.Provider value={layoutCardPadrao}>
            <FrameOffsetContext.Provider value={0}>
              <SharedCardZoneFrame cena={localCena}>
                {renderCenaV2(localCena)}
              </SharedCardZoneFrame>
            </FrameOffsetContext.Provider>
          </CardLayoutContext.Provider>
        </SombraContext.Provider>
      </FontPresetProvider>
    </AbsoluteFill>
  );
};
