import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { Chrome, MonoLabel, RegionHud, useCardLayout, useFades, useSombra } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaFonte: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, translateY, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);
  const fonteTexto = cena.fonte ?? cena.texto ?? "FONTE";

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <RegionHud anchor="bl" intensity={0.34} />

        <div
          style={{
            position: "absolute",
            left: 92,
            bottom: 118,
            opacity,
            transform: `translateY(${translateY}px)`,
          }}
        >
          <Chrome
            w={390}
            h={360}
            hud={["grid", "scanline", "dots-tr"]}
            idSuffix="fonte-v"
            cornerRadius={22}
            showInnerLine={false}
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            gridOpacity={0.08}
            ghostStrokeWidth={6}
            outlineStrokeWidth={2}
            bracketStrokeWidth={12}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                padding: "34px 34px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <SectionSymbol size={62} />
                <div style={{ height: 3, flex: 1, background: C.verdeMoldura }} />
              </div>

              <div style={{ marginTop: 24 }}>
                <MonoLabel text="FONTE" size={18} letterSpacing={3} color={C.verdeMoldura} />
                <SourceText text={fonteTexto} dense />
                {cena.subtexto && <SubText text={cena.subtexto} />}
              </div>
            </div>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <RegionHud anchor="br" intensity={0.45} />

      <div
        style={{
          position: "absolute",
          right: 60,
          bottom: 120,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <Chrome
          w={680}
          h={180}
          hud={["scanline", "dots-tr"]}
          idSuffix="fonte"
          cornerRadius={22}
          showInnerLine={false}
          reveal={reveal}
          bgOpacity={sombra.cardOpacity}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: "24px 30px",
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <SectionSymbol size={68} />
            <div style={{ width: 3, height: 110, background: C.verdeMoldura }} />

            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <MonoLabel text="FONTE" size={20} letterSpacing={3} color={C.verdeMoldura} />
              <SourceText text={fonteTexto} />
              {cena.subtexto && <SubText text={cena.subtexto} />}
            </div>
          </div>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
};

const SectionSymbol: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      fontFamily: F.serifItalic,
      fontStyle: "italic",
      fontSize: size,
      color: C.azulAcento,
      lineHeight: 1,
      marginTop: -8,
    }}
  >
    {"\u00A7"}
  </div>
);

const SourceText: React.FC<{ text: string; dense?: boolean }> = ({ text, dense = false }) => (
  <div
    style={{
      marginTop: 6,
      fontFamily: F.display,
      fontSize: dense ? 28 : 32,
      fontWeight: 700,
      color: C.branco,
      lineHeight: 1.15,
      whiteSpace: dense ? "normal" : "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      textShadow: SH.textoSobreVideo,
    }}
  >
    {text}
  </div>
);

const SubText: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      fontFamily: F.mono,
      fontSize: 16,
      letterSpacing: 1.8,
      color: C.brancoMuted,
      marginTop: 4,
      lineHeight: 1.25,
    }}
  >
    {text}
  </div>
);
