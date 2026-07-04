import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import {
  AmbientHud,
  Chrome,
  LensLine,
  RegionHud,
  RichTitle,
  MascotSpotlight,
  useCardLayout,
  useFades,
  useSombra,
  AutoFitText,
} from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaFullscreen: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, translateY, reveal } = useFades({ frameLocal, fps, duracao });
  const layout = useCardLayout(cena);
  const modelo = resolverModeloTelaCheia(cena);
  const sombra = useSombra(cena);
  const subtitleParts: RichTitlePart[] = cena.subtexto
    ? ([{ break: true } as const, { break: true } as const, { highlight: cena.subtexto.toUpperCase() }] as RichTitlePart[])
    : [];
  const parts: RichTitlePart[] = [
    { italic: (cena.texto ?? "TUDO E RELATIVO").toUpperCase() },
    { editorial: "" },
    ...subtitleParts,
  ];

  if (modelo === "card") {
    if (layout === "vertical") {
      return (
        <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>

          <div
            style={{
              position: "absolute",
              top: 112,
              left: 92,
              transform: `translateY(${translateY}px)`,
              filter:
                "drop-shadow(0 14px 30px rgba(0,0,0,0.72)) drop-shadow(0 36px 90px rgba(0,0,0,0.58))",
            }}
          >
            <Chrome
              w={560}
              h={720}
              hud={["grid", "circles-tl", "dots-tr"]}
              idSuffix="fullscreen-card-v"
              reveal={reveal}
              bgOpacity={sombra.cardOpacity}
              gridOpacity={0.08}
              showInnerLine={false}
              ghostStrokeWidth={6}
              outlineStrokeWidth={2}
              bracketStrokeWidth={12}
            >
              <MascotSpotlight
                mood={cena.mascotMood || "serio"}
                tamanho="medio"
                size={230}
                style={{ position: "absolute", top: 46, left: 34 }}
              />

              <div
                style={{
                  position: "absolute",
                  top: 118,
                  right: 48,
                  left: 350,
                  fontFamily: F.mono,
                  fontSize: 35,
                  letterSpacing: 5,
                  color: C.azulAcento,
                  fontWeight: 600,
                }}
              >
                {(cena.contexto ?? "TESE").toUpperCase()}
              </div>

              <AutoFitText
                maxHeight={310}
                style={{
                  position: "absolute",
                  top: 356,
                  right: 48,
                  left: 48,
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                }}
              >
                <RichTitle parts={parts} size={52} maxWidth={450} />
                <LensLine width={330} />
              </AutoFitText>
            </Chrome>
          </div>
        </AbsoluteFill>
      );
    }

    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <AmbientHud intensity={0.65} dotsTR={true} />
        <RegionHud anchor="tl" intensity={0.35} />

        <div
          style={{
            position: "absolute",
            top: "17%",
            left: "10%",
            transform: `translateY(${translateY}px)`,
            filter:
              "drop-shadow(0 14px 30px rgba(0,0,0,0.72)) drop-shadow(0 36px 90px rgba(0,0,0,0.58))",
          }}
        >
          <Chrome
            w={1180}
            h={520}
            hud={["grid", "circles-tl", "semicircles-tr", "dots-tr"]}
            idSuffix="fullscreen-card"
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            showInnerLine={false}
            ghostStrokeWidth={8}
            outlineStrokeWidth={2.4}
            bracketStrokeWidth={16}
          >
            <MascotSpotlight
              mood={cena.mascotMood || "serio"}
              tamanho="medio"
              size={360}
              style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)" }}
            />

            <AutoFitText
              maxHeight={480}
              style={{
                position: "absolute",
                top: 0,
                right: 72,
                bottom: 0,
                left: 390,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 24,
              }}
            >
              <Kicker text={(cena.contexto ?? "TESE").toUpperCase()} />
              <RichTitle parts={parts} size={70} maxWidth={720} />
              <LensLine width={430} />
            </AutoFitText>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      <AmbientHud intensity={sombra.ambient} dotsTR={true} />

      <div
        style={{
          position: "absolute",
          left: "5%",
          top: "12%",
          right: "5%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <Mascote mood={cena.mascotMood || "serio"} tamanho="grande" />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 28,
            maxWidth: 900,
          }}
        >
          <Kicker text={(cena.contexto ?? "TESE").toUpperCase()} />
          <RichTitle parts={parts} size={92} maxWidth={900} />
          <LensLine width={520} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      fontFamily: F.mono,
      fontSize: 22,
      letterSpacing: 6,
      color: C.azulAcento,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}
  >
    <div style={{ width: 40, height: 2, background: C.azulAcento }} />
    {text}
  </div>
);

export function resolverModeloTelaCheia(_cena: Pick<CenaRemotion, "modelo_cena">): "padrao" | "card" {
  // I-031: tela_cheia agora renderiza SEMPRE como card.
  // O seletor mantem `padrao` como opcao cosmetica, mas o render ignora.
  return "card";
}
