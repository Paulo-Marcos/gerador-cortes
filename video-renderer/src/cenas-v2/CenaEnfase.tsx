import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import {
  AmbientHud,
  Chrome,
  LensLine,
  RegionHud,
  MascotSpotlight,
  useCardLayout,
  useFades,
  useSombra,
  AutoFitText,
} from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaEnfase: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, translateY, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);
  const titulo = cena.texto ?? "IDEIA-CHAVE";
  const detalhe = cena.subtexto;
  const rotulo = (cena.contexto ?? "ENFASE").toUpperCase();

  if (cena.modelo_cena === "card") {
    return layout === "vertical" ? (
      <CardVertical
        cena={cena}
        opacity={opacity}
        reveal={reveal}
        sombra={sombra.cardOpacity}
        titulo={titulo}
        detalhe={detalhe}
        rotulo={rotulo}
      />
    ) : (
      <CardHorizontal
        cena={cena}
        opacity={opacity}
        reveal={reveal}
        sombra={sombra.cardOpacity}
        titulo={titulo}
        detalhe={detalhe}
        rotulo={rotulo}
      />
    );
  }

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <AmbientHud intensity={0.8} dotsTR />
      <RegionHud anchor="tl" intensity={0.18} />
      <RegionHud anchor="br" intensity={0.14} />

      <div
        style={{
          position: "absolute",
          left: 142,
          right: 170,
          top: "22%",
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          alignItems: "center",
          gap: 52,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <Mascote mood={cena.mascotMood || "enfatico"} tamanho="medio" />

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <Kicker text={rotulo} />
          <div
            style={{
              fontFamily: F.display,
              fontSize: sizeFor(titulo, 138, 112, 88),
              fontWeight: 950,
              color: C.branco,
              lineHeight: 0.9,
              textTransform: "uppercase",
              textShadow: SH.textoSobreVideo,
              maxWidth: 1040,
            }}
          >
            {titulo}
          </div>
          {detalhe && <Detail text={detalhe} />}
          <LensLine width={520} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

function CardVertical({
  cena,
  opacity,
  reveal,
  sombra,
  titulo,
  detalhe,
  rotulo,
}: {
  cena: CenaRemotion;
  opacity: number;
  reveal: number;
  sombra: number;
  titulo: string;
  detalhe?: string;
  rotulo: string;
}) {
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>

      <div
        style={{
          position: "absolute",
          top: 128,
          left: 92,
        }}
      >
        <Chrome
          w={480}
          h={610}
          hud={["grid", "circles-tl", "dots-tr"]}
          idSuffix="enfase-card-v"
          reveal={reveal}
          bgOpacity={sombra}
          gridOpacity={0.08}
          showInnerLine={false}
          ghostStrokeWidth={6}
          outlineStrokeWidth={2}
          bracketStrokeWidth={12}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "enfatico"}
            tamanho="pequeno"
            size={220}
            style={{ position: "absolute", top: 44, left: 38 }}
          />

          <div
            style={{
              position: "absolute",
              top: 112,
              right: 46,
              left: 244,
            }}
          >
            <Kicker text={rotulo} compact />
          </div>

          <AutoFitText
            maxHeight={260}
            style={{
              position: "absolute",
              top: 292,
              right: 46,
              left: 52,
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            <Title text={titulo} size={sizeFor(titulo, 58, 50, 42)} />
            {detalhe && <Detail text={detalhe} />}
            <LensLine width={330} />
          </AutoFitText>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
}

function CardHorizontal({
  cena,
  opacity,
  reveal,
  sombra,
  titulo,
  detalhe,
  rotulo,
}: {
  cena: CenaRemotion;
  opacity: number;
  reveal: number;
  sombra: number;
  titulo: string;
  detalhe?: string;
  rotulo: string;
}) {
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <AmbientHud intensity={0.55} dotsTR />
      <RegionHud anchor="tl" intensity={0.3} />

      <div
        style={{
          position: "absolute",
          top: 130,
          left: 92,
          filter:
            "drop-shadow(0 14px 30px rgba(0,0,0,0.72)) drop-shadow(0 36px 90px rgba(0,0,0,0.58))",
        }}
      >
        <Chrome
          w={820}
          h={360}
          hud={["grid", "circles-tl", "semicircles-tr", "dots-tr"]}
          idSuffix="enfase-card-h"
          reveal={reveal}
          bgOpacity={sombra}
          showInnerLine={false}
          ghostStrokeWidth={7}
          outlineStrokeWidth={2.3}
          bracketStrokeWidth={14}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "enfatico"}
            tamanho="pequeno"
            size={240}
            style={{ position: "absolute", top: 56, left: 34 }}
          />

          <AutoFitText
            maxHeight={360}
            style={{
              position: "absolute",
              top: 0,
              right: 54,
              bottom: 0,
              left: 276,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 20,
            }}
          >
            <Kicker text={rotulo} compact />
            <Title text={titulo} size={sizeFor(titulo, 64, 54, 44)} />
            {detalhe && <Detail text={detalhe} />}
          </AutoFitText>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
}

const Kicker: React.FC<{ text: string; compact?: boolean }> = ({ text, compact = false }) => (
  <div
    style={{
      fontFamily: F.mono,
      fontSize: `calc(${compact ? 15 : 22}px * var(--font-scale, 1))`,
      letterSpacing: compact ? 4 : 6,
      color: C.azulAcento,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      gap: compact ? 10 : 14,
    }}
  >
    <div style={{ width: compact ? 30 : 42, height: 2, background: C.azulAcento }} />
    {text}
  </div>
);

const Title: React.FC<{ text: string; size: number }> = ({ text, size }) => (
  <div
    style={{
      fontFamily: F.display,
      fontSize: `calc(${size}px * var(--font-scale, 1))`,
      fontWeight: 950,
      color: C.branco,
      lineHeight: 0.92,
      textTransform: "uppercase",
      textShadow: SH.textoSobreVideo,
    }}
  >
    {text}
  </div>
);

const Detail: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      fontFamily: F.serifItalic,
      fontStyle: "italic",
      fontSize: `calc(28px * var(--font-scale, 1))`,
      color: C.brancoMuted,
      lineHeight: 1.16,
      maxWidth: 640,
      textShadow: SH.textoSobreVideo,
    }}
  >
    {text}
  </div>
);

function sizeFor(text: string, large: number, medium: number, small: number) {
  if (text.length > 32) return small;
  if (text.length > 18) return medium;
  return large;
}
