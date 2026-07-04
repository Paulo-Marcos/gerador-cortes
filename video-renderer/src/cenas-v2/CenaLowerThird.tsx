import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { AutoFitText, Chrome, RegionHud, MascotSpotlight, useCardLayout, useFades, useSombra } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaLowerThird: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="bl" intensity={0.42} />

        <div
          style={{
            position: "absolute",
            left: 92,
            bottom: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.78)) drop-shadow(0 28px 76px rgba(0,0,0,0.62))",
          }}
        >
          <Chrome
            w={440}
            h={430}
            hud={["grid", "scanline", "circles-tl", "dots-tr"]}
            idSuffix="lt-v"
            background="verde"
            cornerRadius={22}
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            gridOpacity={0.08}
            showInnerLine={false}
            ghostStrokeWidth={6}
            outlineStrokeWidth={2}
            bracketStrokeWidth={12}
          >
            <MascotSpotlight
              mood={cena.mascotMood || "apresentador"}
              tamanho="pequeno"
              size={180}
              style={{ position: "absolute", top: 24, left: 22 }}
            />
            <IndexText value={cena.contexto ?? "01"} style={{ right: 38, top: 54, fontSize: `calc(96px * var(--font-scale, 1))` }} />

            <AutoFitText
              maxHeight={180}
              style={{
                position: "absolute",
                right: 38,
                bottom: 42,
                left: 42,
                justifyContent: "flex-end",
              }}
            >
              <TitleBlock cena={cena} dense />
            </AutoFitText>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <RegionHud anchor="bl" intensity={0.55} />

      <div
        style={{
          position: "absolute",
          bottom: "6%",
          left: "4%",
          filter:
            "drop-shadow(0 10px 22px rgba(0,0,0,0.9)) drop-shadow(0 32px 70px rgba(0,0,0,0.9))",
        }}
      >
        <Chrome
          w={900}
          h={180}
          hud={["scanline", "circles-tl", "dots-tr"]}
          idSuffix="lt"
          background="verde"
          cornerRadius={22}
          reveal={reveal}
          bgOpacity={sombra.cardOpacity}
          showInnerLine={false}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "apresentador"}
            tamanho="pequeno"
            size={170}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}
          />
          <IndexText value={cena.contexto ?? "01"} style={{ right: 28, top: "50%", transform: "translateY(-50%)", fontSize: `calc(100px * var(--font-scale, 1))` }} />

          <AutoFitText
            maxHeight={180}
            style={{
              position: "absolute",
              top: 0,
              right: 120,
              bottom: 0,
              left: 180,
              padding: "0 24px",
              boxSizing: "border-box",
              justifyContent: "center",
            }}
          >
            <TitleBlock cena={cena} />
          </AutoFitText>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
};

const TitleBlock: React.FC<{ cena: CenaRemotion; dense?: boolean }> = ({ cena, dense = false }) => (
  <>
    <div
      style={{
        fontFamily: F.display,
        fontSize: `calc(${dense ? 31 : 36}px * var(--font-scale, 1))`,
        fontWeight: 900,
        color: C.branco,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        lineHeight: 1.05,
        textShadow: SH.textoSobreVideo,
      }}
    >
      {cena.texto}
    </div>
    {cena.subtexto && (
      <div
        style={{
          marginTop: 8,
          fontFamily: F.mono,
          fontSize: `calc(${dense ? 14 : 16}px * var(--font-scale, 1))`,
          letterSpacing: dense ? 2 : 2.5,
          color: C.brancoMuted,
          lineHeight: 1.2,
        }}
      >
        {cena.subtexto}
      </div>
    )}
  </>
);

const IndexText: React.FC<{ value: string; style?: React.CSSProperties }> = ({ value, style }) => (
  <div
    style={{
      position: "absolute",
      fontFamily: F.serifItalic,
      fontStyle: "italic",
      lineHeight: 0.85,
      color: C.azulAcento,
      opacity: 0.95,
      pointerEvents: "none",
      textShadow: SH.textoSobreVideo,
      ...style,
    }}
  >
    {value}
  </div>
);
