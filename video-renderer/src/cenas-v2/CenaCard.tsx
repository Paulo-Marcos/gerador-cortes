import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import { Chrome, RegionHud, RichTitle, useCardLayout, useFades, useSombra, AutoFitText } from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

/**
 * card_informacao — Sapo DENTRO do card com spotlight azul atrás.
 * Mesma estrutura validada na CenaPergunta: sombra externa fixa,
 * conteúdo com longhands, showInnerLine=false.
 */
export const CenaCard: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const titleParts: RichTitlePart[] = cena.texto
    ? [
        cena.texto.toUpperCase(),
        ...(cena.subtexto
          ? ([{ italic: "." }, { break: true }, { break: true }, { highlight: cena.subtexto.toUpperCase() }] as RichTitlePart[])
          : []),
      ]
    : [];

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="tl" intensity={0.42} />

        <div
          style={{
            position: "absolute",
            top: 116,
            left: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.72)) drop-shadow(0 26px 70px rgba(0,0,0,0.64))",
          }}
        >
          <Chrome
            w={520}
            h={760}
            hud={["grid", "circles-tl", "dots-tr"]}
            idSuffix="card-v"
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
                top: 46,
                left: 44,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontFamily: F.mono,
                fontSize: 26,
                letterSpacing: 4,
                color: C.azulAcento,
                fontWeight: 600,
              }}
            >
              <div style={{ width: 30, height: 2, background: C.azulAcento }} />
              {(cena.contexto ?? "CONTEXTO").toUpperCase()}
            </div>

            <div style={{ position: "absolute", right: 110, top: 30, width: 226, height: 226 }}>
              <div
                style={{
                  position: "absolute",
                  inset: -24,
                  background: `radial-gradient(circle at 50% 50%, rgba(155,207,227,0.38) 0%, rgba(155,207,227,0.22) 28%, rgba(155,207,227,0.10) 50%, transparent 72%)`,
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
              maxHeight={380}
              style={{
                position: "absolute",
                top: 320,
                right: 44,
                bottom: 54,
                left: 44,
              }}
            >
              {titleParts.length > 0 && <RichTitle parts={titleParts} size={38} maxWidth={420} />}
              {cena.contexto && cena.texto && (
                <div
                  style={{
                    marginTop: 24,
                    fontFamily: F.serif,
                    fontSize: "calc(25px * var(--font-scale, 1))",
                    color: C.brancoMuted,
                    lineHeight: 1.28,
                    maxWidth: 410,
                  }}
                >
                  {cena.contexto}
                </div>
              )}
            </AutoFitText>

            <div style={{ position: "absolute", left: 44, bottom: 34, width: 86, height: 2, background: C.azulAcento, opacity: 0.7 }} />
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
          top: "12%",
          left: "4%",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            marginLeft: "-2%",
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.9)) drop-shadow(0 32px 70px rgba(0,0,0,0.9))",
          }}
        >
          <Chrome
            w={920}
            h={230}
            hud={["grid", "circles-tl", "semicircles-tr", "dots-tr", "scanline"]}
            idSuffix="card"
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            showInnerLine={false}
          >
            {/* Sapo destacado: spotlight radial azul-acento atrás + glow */}
            <div
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 220,
                height: 220,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -30,
                  background: `radial-gradient(circle at 50% 50%,
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
                <Mascote mood={cena.mascotMood || "investigador"} tamanho="pequeno" />
              </div>
            </div>

            {/* Conteúdo: kicker + título + contexto */}
            <AutoFitText
              maxHeight={170}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 220,
                padding: "30px 36px",
                paddingRight: 48,
                boxSizing: "border-box",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: F.mono,
                  fontSize: "calc(16px * var(--font-scale, 1))",
                  letterSpacing: 4,
                  color: C.azulAcento,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div style={{ width: 32, height: 2, background: C.azulAcento }} />
                {(cena.contexto ?? "CONTEXTO").toUpperCase()}
              </div>

              {titleParts.length > 0 && <RichTitle parts={titleParts} size={36} />}

              {cena.contexto && cena.texto && (
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: F.serifItalic,
                    fontStyle: "italic",
                    fontSize: "calc(18px * var(--font-scale, 1))",
                    color: C.brancoMuted,
                    lineHeight: 1.3,
                    maxWidth: "95%",
                  }}
                >
                  {cena.contexto}
                </div>
              )}
            </AutoFitText>
          </Chrome>
        </div>
      </div>
    </AbsoluteFill>
  );
};
