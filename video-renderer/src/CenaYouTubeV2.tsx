import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { normalizarCenaRemotion, YouTubeProps } from "./schema";
import { FrameOffsetContext } from "./frame-context";
import { renderCenaV2 } from "./cenas-v2";
import { CardLayoutContext, FontPresetProvider, SombraContext } from "./cenas-v2/_shared";

/**
 * Versão v2 do CenaYouTube — usa as cenas da `cenas-v2/` (nova identidade
 * editorial). Mesma lógica de fatiamento e ativação por janela temporal,
 * apenas troca o renderizador de cena.
 */
export const CenaYouTubeV2: React.FC<YouTubeProps> = ({
  videoUrl,
  cenas,
  filtroCss,
  renderStartFrame,
  sombraNivelPadrao,
  layoutCardPadrao,
  fontPreset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startOffset = renderStartFrame ?? 0;
  const globalFrame = frame + startOffset;
  const currentTime = globalFrame / fps;

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <OffthreadVideo
          src={videoUrl}
          startFrom={startOffset}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: filtroCss || "none",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill>
        <FontPresetProvider preset={fontPreset}>
          <SombraContext.Provider value={sombraNivelPadrao}>
            <CardLayoutContext.Provider value={layoutCardPadrao}>
              <FrameOffsetContext.Provider value={startOffset}>
                {cenas.map((cena, index) => {
                  const cenaNormalizada = normalizarCenaRemotion(cena);
                  const isActive =
                    currentTime >= cenaNormalizada.inicio &&
                    currentTime <= cenaNormalizada.fim;
                  if (!isActive) return null;
                  return (
                    <div key={index} style={{ position: "absolute", inset: 0 }}>
                      {renderCenaV2(cenaNormalizada)}
                    </div>
                  );
                })}
              </FrameOffsetContext.Provider>
            </CardLayoutContext.Provider>
          </SombraContext.Provider>
        </FontPresetProvider>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
