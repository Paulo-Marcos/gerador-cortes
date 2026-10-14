import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { OverlayTimelineProps } from "./overlay-schema";
import { FrameOffsetContext } from "./frame-context";
import { renderCenaV2 } from "./cenas-v2";
import { normalizarCenaRemotion } from "./schema";
import { CardLayoutContext, FontPresetProvider, SombraContext } from "./cenas-v2/_shared";
import { EstiloDasCenasProvider } from "./cenas-limpo";
import { continuaNaProxima } from "./cenas-limpo/movimento";
import { ContinuidadeContext } from "./cenas-limpo/tempo-da-cena";
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
  estiloCenas,
}) => {
  const { fps } = useVideoConfig();
  // D-918: o morph do estilo limpo — quem continua quem, entre vizinhas.
  const normalizadas = cenas.map((cena) => normalizarCenaRemotion(cena));

  return (
    <AbsoluteFill>
      <FontPresetProvider preset={fontPreset}>
        <EstiloDasCenasProvider valor={estiloCenas}>
        <SombraContext.Provider value={sombraNivelPadrao}>
          <CardLayoutContext.Provider value={layoutCardPadrao}>
            {cenas.map((cena, index) => {
              const cenaNormalizada = normalizadas[index];
              const continuidade = {
                daAnterior: index > 0 && continuaNaProxima(normalizadas[index - 1], cenaNormalizada),
                naProxima: continuaNaProxima(cenaNormalizada, normalizadas[index + 1]),
              };
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
                  <ContinuidadeContext.Provider value={continuidade}>
                  <FrameOffsetContext.Provider value={from}>
                    <SharedCardZoneFrame cena={cenaNormalizada}>
                      {renderCenaV2(cenaNormalizada)}
                    </SharedCardZoneFrame>
                  </FrameOffsetContext.Provider>
                  </ContinuidadeContext.Provider>
                </Sequence>
              );
            })}
          </CardLayoutContext.Provider>
        </SombraContext.Provider>
        </EstiloDasCenasProvider>
      </FontPresetProvider>
    </AbsoluteFill>
  );
};
