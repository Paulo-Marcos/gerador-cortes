import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import {
  Chrome,
  IconBox,
  LensLine,
  RegionHud,
  RichTitle,
  MascotSpotlight,
  Tag,
  useCardLayout,
  useFades,
  useSombra,
} from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaPergunta: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const titleParts: RichTitlePart[] = cena.subtexto
    ? [
        cena.texto?.toUpperCase() ?? "COMO DISTINGUIR",
        { break: true },
        { highlight: cena.subtexto.toUpperCase() },
        { editorial: "?" },
      ]
    : cena.texto
      ? [cena.texto.toUpperCase(), { editorial: "" }]
      : [];

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="tl" intensity={0.42} />

        <div
          style={{
            position: "absolute",
            top: 112,
            left: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.78)) drop-shadow(0 28px 72px rgba(0,0,0,0.66))",
          }}
        >
          <Chrome
            w={520}
            h={680}
            hud={["grid", "circles-tl", "dots-tr", "scanline"]}
            idSuffix="pergunta-v"
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            gridOpacity={0.1}
            showInnerLine={false}
            ghostStrokeWidth={6}
            outlineStrokeWidth={2}
            bracketStrokeWidth={12}
          >
            <MascotSpotlight
              mood={cena.mascotMood || "pensativo"}
              tamanho="medio"
              size={220}
              style={{ position: "absolute", top: 20, left: 38 }}
            />
            <QuestionMark style={{ right: 60, top: 84, fontSize: 128 }} />

            <div
              style={{
                position: "absolute",
                top: 292,
                right: 44,
                bottom: 52,
                left: 44,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 36 }}>
                <IconBox size={55}>
                  <QuoteIcon size={49} />
                </IconBox>
                <Tag text={(cena.contexto ?? "PERGUNTA CENTRAL").toUpperCase()} height={55} fontSize={22} />
              </div>

              {titleParts.length > 0 && <RichTitle parts={titleParts} size={38} maxWidth={410} />}

              <div style={{ marginTop: 30 }}>
                <LensLine width={330} />
              </div>
            </div>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <RegionHud anchor="tl" intensity={0.55} />

      <div
        style={{
          position: "absolute",
          top: "14%",
          left: "4%",
          filter:
            "drop-shadow(0 10px 22px rgba(0,0,0,0.9)) drop-shadow(0 32px 70px rgba(0,0,0,0.9))",
        }}
      >
        <Chrome
          w={800}
          h={200}
          hud={["grid", "circles-tl", "semicircles-tr", "dots-tr", "scanline"]}
          idSuffix="pergunta"
          reveal={reveal}
          bgOpacity={sombra.cardOpacity}
          showInnerLine={false}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "pensativo"}
            tamanho="pequeno"
            size={200}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}
          />
          <QuestionMark style={{ right: 28, top: "50%", transform: "translateY(-50%)", fontSize: 120 }} />

          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 200,
              padding: "36px 80px 36px 36px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", gap: 18, alignItems: "stretch", marginBottom: 30 }}>
              <IconBox size={50}>
                <QuoteIcon size={46} />
              </IconBox>
              <Tag text={(cena.contexto ?? "PERGUNTA CENTRAL").toUpperCase()} height={50} fontSize={22} />
            </div>

            {titleParts.length > 0 && <RichTitle parts={titleParts} size={30} />}

            <div style={{ marginTop: 18 }}>
              <LensLine />
            </div>
          </div>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
};

const QuestionMark: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      position: "absolute",
      fontFamily: F.serifItalic,
      fontStyle: "italic",
      lineHeight: 0.85,
      color: C.azulAcento,
      opacity: 1,
      pointerEvents: "none",
      textShadow: "0 8px 22px rgba(0,0,0,0.7)",
      ...style,
    }}
  >
    ?
  </div>
);

const QuoteIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M9.4 6c-1.6 0-3 .5-4 1.6S4 10 4 11.7v6.3h6.3V11h-3c0-1 .3-1.7.8-2.3.5-.5 1.4-.8 2.5-.8V6h-1.2z" />
  </svg>
);
