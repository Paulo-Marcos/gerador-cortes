import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import { AmbientHud, Chrome, MonoLabel, RichTitle, MascotSpotlight, useCardLayout, useFades, useSombra, AutoFitText } from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaCTA: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const pulsePhase = (frameLocal % Math.round(fps * 2)) / Math.round(fps * 2);
  const pulse = 1 + Math.sin(pulsePhase * Math.PI * 2) * 0.015;

  const titleParts: RichTitlePart[] = cena.texto
    ? [cena.texto.toUpperCase()]
    : ["INSCREVA-SE", { break: true }, "E", { italic: "venha" }, { highlight: "PENSAR" }, "JUNTO"];

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <AmbientHud intensity={0.6} scanline={false} />

        <div
          style={{
            position: "absolute",
            top: 92,
            left: 92,
            width: 560,
            transform: `scale(${interpolate(reveal, [0, 1], [0.96, 1]) * pulse})`,
            transformOrigin: "left center",
          }}
        >
          <MascotSpotlight mood={cena.mascotMood || "animado"} tamanho="medio" size={280} style={{ marginLeft: 4 }} />

          <AutoFitText maxHeight={280} style={{ marginTop: 10 }}>
            <MonoLabel text={(cena.contexto ?? "ATE AQUI").toUpperCase()} size={18} letterSpacing={7} />
            <div style={{ marginTop: 18 }}>
              <RichTitle parts={titleParts} size={60} maxWidth={520} />
            </div>
          </AutoFitText>

          <div style={{ marginTop: 34, filter: `drop-shadow(${SH.glowMoldura})` }}>
            <CtaButton cena={cena} reveal={reveal} sombraOpacity={sombra.cardOpacity} w={520} h={130} />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <AmbientHud intensity={0.7} scanline={false} />
      <Reticle />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 48,
          zIndex: 1,
          transform: `scale(${interpolate(reveal, [0, 1], [0.96, 1]) * pulse})`,
        }}
      >
        <Mascote mood={cena.mascotMood || "animado"} tamanho="grande" />

        <AutoFitText
          maxHeight={400}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <MonoLabel text={(cena.contexto ?? "ATE AQUI").toUpperCase()} size={20} letterSpacing={8} />
          <RichTitle parts={titleParts} size={92} />
          <div style={{ height: 18 }} />
          <div style={{ position: "relative", filter: `drop-shadow(${SH.glowMoldura})` }}>
            <CtaButton cena={cena} reveal={reveal} sombraOpacity={sombra.cardOpacity} w={620} h={130} />
          </div>
        </AutoFitText>
      </div>
    </AbsoluteFill>
  );
};

const CtaButton: React.FC<{
  cena: CenaRemotion;
  reveal: number;
  sombraOpacity: number;
  w: number;
  h: number;
}> = ({ cena, reveal, sombraOpacity, w, h }) => (
  <Chrome
    w={w}
    h={h}
    hud={["scanline"]}
    idSuffix={`cta-${w}`}
    cornerRadius={28}
    reveal={reveal}
    bgOpacity={sombraOpacity}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: F.display,
          fontSize: `calc(${w < 560 ? 31 : 36}px * var(--font-scale, 1))`,
          fontWeight: 900,
          color: C.branco,
          letterSpacing: w < 560 ? 2.8 : 4,
          textTransform: "uppercase",
        }}
      >
        {cena.subtexto ?? "INSCREVA-SE NO CANAL"}
      </div>
      <div
        style={{
          fontFamily: F.serifItalic,
          fontStyle: "italic",
          fontSize: 50,
          color: C.azulAcento,
          transform: "translateY(-3px)",
        }}
      >
        {"\u2192"}
      </div>
    </div>
  </Chrome>
);

const Reticle: React.FC = () => (
  <svg width={1200} height={1200} style={{ position: "absolute", opacity: 0.4 }} viewBox="0 0 1200 1200">
    <g stroke={C.azulSoft} fill="none" strokeWidth="1">
      <circle cx="600" cy="600" r="400" strokeDasharray="3 8" />
      <circle cx="600" cy="600" r="500" opacity="0.5" />
    </g>
  </svg>
);
