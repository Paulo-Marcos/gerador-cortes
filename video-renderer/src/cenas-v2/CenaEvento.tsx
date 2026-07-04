import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { Chrome, MonoLabel, RegionHud, RichTitle, MascotSpotlight, useCardLayout, useFades, useSombra } from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaEvento: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const titleParts: RichTitlePart[] = cena.subtexto
    ? [cena.texto?.toUpperCase() ?? "EVENTO", { break: true }, { highlight: cena.subtexto.toUpperCase() }]
    : cena.texto
      ? [cena.texto.toUpperCase()]
      : [];

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="tl" intensity={0.42} />

        <div
          style={{
            position: "absolute",
            top: 120,
            left: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.78)) drop-shadow(0 28px 76px rgba(0,0,0,0.64))",
          }}
        >
          <Chrome
            w={540}
            h={700}
            hud={["grid", "circles-tl", "dots-tr"]}
            idSuffix="evento-v"
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            gridOpacity={0.08}
            showInnerLine={false}
            ghostStrokeWidth={6}
            outlineStrokeWidth={2}
            bracketStrokeWidth={12}
          >
            <MascotSpotlight
              mood={cena.mascotMood || "investigador"}
              tamanho="pequeno"
              size={220}
              style={{ position: "absolute", top: 42, left: 28 }}
            />
            <YearText value={cena.ano ?? ""} style={{ right: 42, top: 70, fontSize: 112 }} />

            <div
              style={{
                position: "absolute",
                top: 292,
                right: 48,
                left: 48,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <MonoLabel text="MARCO HISTORICO" size={15} letterSpacing={4} />
              {titleParts.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <RichTitle parts={titleParts} size={36} maxWidth={420} />
                </div>
              )}
              {cena.obra && <MetaText text={cena.obra.toUpperCase()} style={{ marginTop: 18 }} />}
              {cena.contexto && <MetaText text={cena.contexto.toUpperCase()} accent style={{ marginTop: 7 }} />}
            </div>
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
          top: "16%",
          left: "4%",
          filter:
            "drop-shadow(0 10px 22px rgba(0,0,0,0.9)) drop-shadow(0 32px 70px rgba(0,0,0,0.9))",
        }}
      >
        <Chrome
          w={1050}
          h={280}
          hud={["grid", "circles-tl", "semicircles-tr", "dots-tr", "scanline"]}
          idSuffix="evento"
          reveal={reveal}
          bgOpacity={sombra.cardOpacity}
          showInnerLine={false}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "investigador"}
            tamanho="pequeno"
            size={220}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}
          />
          <YearText value={cena.ano ?? ""} style={{ right: 28, top: "50%", transform: "translateY(-50%)", fontSize: 140 }} />

          <div
            style={{
              position: "absolute",
              top: 0,
              right: 280,
              bottom: 0,
              left: 220,
              padding: "28px 24px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <MonoLabel text="MARCO HISTORICO" size={16} letterSpacing={4} />
            {titleParts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <RichTitle parts={titleParts} size={36} />
              </div>
            )}
            {cena.obra && <MetaText text={cena.obra.toUpperCase()} style={{ marginTop: 10 }} />}
            {cena.contexto && <MetaText text={cena.contexto.toUpperCase()} accent style={{ marginTop: 4 }} />}
          </div>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
};

const YearText: React.FC<{ value: string; style?: React.CSSProperties }> = ({ value, style }) => (
  <div
    style={{
      position: "absolute",
      fontFamily: F.display,
      fontWeight: 900,
      lineHeight: 0.85,
      color: C.azulAcento,
      opacity: 0.95,
      letterSpacing: "-0.04em",
      pointerEvents: "none",
      textShadow: "0 8px 22px rgba(0,0,0,0.7)",
      ...style,
    }}
  >
    {value}
  </div>
);

const MetaText: React.FC<{ text: string; accent?: boolean; style?: React.CSSProperties }> = ({ text, accent = false, style }) => (
  <div
    style={{
      fontFamily: F.mono,
      fontSize: accent ? 13 : 14,
      letterSpacing: accent ? 1.8 : 2,
      color: accent ? C.azulAcento : C.brancoMuted,
      lineHeight: 1.25,
      ...style,
    }}
  >
    {text}
  </div>
);
