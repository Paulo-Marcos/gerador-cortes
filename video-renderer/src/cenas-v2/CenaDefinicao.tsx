import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import { Chrome, IconBox, LensLine, MonoLabel, RegionHud, useCardLayout, useFades, useSombra, AutoFitText } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

const CARD = {
  x: 92,
  y: 116,
  w: 520,
  h: 760,
  padX: 44,
};

export const CenaDefinicao: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const termo = cena.texto || "";
  const definicao = cena.contexto || "";
  const termoFontSize = termo.length > 18 ? 38 : termo.length > 12 ? 44 : 52;
  const definicaoFontSize = definicao.length > 135 ? 24 : definicao.length > 92 ? 27 : 29;

  if (layout === "horizontal") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="bl" intensity={0.5} />

        <div
          style={{
            position: "absolute",
            top: "14%",
            left: "4%",
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.72)) drop-shadow(0 26px 70px rgba(0,0,0,0.64))",
          }}
        >
          <Chrome
            w={920}
            h={260}
            hud={["grid", "circles-tl", "semicircles-tr", "dots-tr"]}
            idSuffix="defi-h"
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            showInnerLine={false}
          >
            <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 220, height: 220 }}>
              <div
                style={{
                  position: "absolute",
                  inset: -28,
                  background: `radial-gradient(circle at 50% 55%, rgba(155,207,227,0.38) 0%, rgba(155,207,227,0.22) 28%, rgba(155,207,227,0.10) 50%, transparent 72%)`,
                  filter: "blur(2px)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  filter:
                    "drop-shadow(0 0 10px rgba(155,207,227,0.45)) drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
                }}
              >
                <Mascote mood={cena.mascotMood || "investigador"} tamanho="pequeno" />
              </div>
            </div>

            <AutoFitText
              maxHeight={204}
              style={{
                position: "absolute",
                top: 0,
                right: 46,
                bottom: 0,
                left: 220,
                padding: "28px 0",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <IconBox size={38}>
                  <svg viewBox="0 0 24 24" width={23} height={23} fill="currentColor">
                    <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 2v11h-7V6h7zm-9 0v11H4V6h7z" />
                  </svg>
                </IconBox>
                <MonoLabel text="DEFINIÇÃO" size={21} letterSpacing={3} />
              </div>

              <div style={{ fontFamily: F.display, fontSize: `calc(${termoFontSize}px * var(--font-scale, 1))`, fontWeight: 900, color: C.branco, lineHeight: 0.96, letterSpacing: 0, textTransform: "uppercase", textShadow: SH.textoSobreVideo }}>
                {termo}
              </div>

              {cena.subtexto && (
                <div style={{ marginTop: 8, fontFamily: F.mono, fontStyle: "italic", fontSize: `calc(20px * var(--font-scale, 1))`, color: C.azulAcento, lineHeight: 1.2 }}>
                  {cena.subtexto}
                </div>
              )}

              {definicao && (
                <div style={{ marginTop: 12, fontFamily: F.mono, fontSize: `calc(${definicaoFontSize}px * var(--font-scale, 1))`, color: C.brancoMuted, lineHeight: 1.26, maxWidth: 610, letterSpacing: 0 }}>
                  {definicao}
                </div>
              )}
            </AutoFitText>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <RegionHud anchor="tl" intensity={0.42} />

      <div
        style={{
          position: "absolute",
          top: CARD.y,
          left: CARD.x,
          width: CARD.w,
          height: CARD.h,
        }}
      >
        <div
          style={{
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.72)) drop-shadow(0 26px 70px rgba(0,0,0,0.64))",
          }}
        >
          <Chrome
            w={CARD.w}
            h={CARD.h}
            hud={["grid", "circles-tl", "dots-tr"]}
            idSuffix="defi"
            reveal={reveal}
            gridOpacity={0.08}
            bgOpacity={sombra.cardOpacity}
            ghostStrokeWidth={6}
            outlineStrokeWidth={2}
            bracketStrokeWidth={12}
            showInnerLine={false}
          >
            <div
              style={{
                position: "absolute",
                top: 38,
                left: CARD.padX,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <IconBox size={38}>
                <svg viewBox="0 0 24 24" width={23} height={23} fill="currentColor">
                  <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 2v11h-7V6h7zm-9 0v11H4V6h7z" />
                </svg>
              </IconBox>
              <MonoLabel text="DEFINIÇÃO" size={22} letterSpacing={3} />
            </div>

            <div
              style={{
                position: "absolute",
                right: 88,
                top: 35,
                width: 226,
                height: 226,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -24,
                  background: `radial-gradient(circle at 50% 55%,
                    rgba(155, 207, 227, 0.38) 0%,
                    rgba(155, 207, 227, 0.22) 28%,
                    rgba(155, 207, 227, 0.10) 50%,
                    transparent 72%)`,
                  filter: "blur(2px)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  filter:
                    "drop-shadow(0 0 10px rgba(155,207,227,0.45)) drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
                }}
              >
                <Mascote mood={cena.mascotMood || "investigador"} tamanho="medio" />
              </div>
            </div>

            <AutoFitText
              maxHeight={392}
              style={{
                position: "absolute",
                top: 320,
                right: CARD.padX,
                bottom: 48,
                left: CARD.padX,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
              }}
            >
              <div
                style={{
                  fontFamily: F.display,
                  fontSize: `calc(${termoFontSize}px * var(--font-scale, 1))`,
                  fontWeight: 900,
                  color: C.branco,
                  lineHeight: 0.96,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  textShadow: SH.textoSobreVideo,
                }}
              >
                {termo}
              </div>

              {cena.subtexto && (
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: F.mono,
                    fontStyle: "italic",
                    fontSize: `calc(22px * var(--font-scale, 1))`,
                    color: C.azulAcento,
                    lineHeight: 1.25,
                    maxWidth: 390,
                  }}
                >
                  {cena.subtexto}
                </div>
              )}

              <div style={{ marginTop: 24, marginBottom: 22 }}>
                <LensLine width="64%" />
              </div>

              {definicao && (
                <div
                  style={{
                    fontFamily: F.mono,
                    fontSize: `calc(${definicaoFontSize}px * var(--font-scale, 1))`,
                    color: C.brancoMuted,
                    lineHeight: 1.34,
                    maxWidth: 418,
                    letterSpacing: 0,
                  }}
                >
                  {definicao}
                </div>
              )}
              </AutoFitText>

            <div
              style={{
                position: "absolute",
                left: CARD.padX,
                bottom: 34,
                width: 86,
                height: 2,
                background: C.azulAcento,
                opacity: 0.7,
              }}
            />
          </Chrome>
        </div>
      </div>
    </AbsoluteFill>
  );
};
