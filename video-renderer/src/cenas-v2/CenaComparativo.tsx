import { AbsoluteFill, useVideoConfig } from "remotion";
import type { CSSProperties } from "react";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import {
  AmbientHud,
  Chrome,
  MonoLabel,
  RegionHud,
  useCardLayout,
  useFades,
  useSombra,
  AutoFitText,
} from "./_shared";

interface Props {
  cena: CenaRemotion;
}

type Align = "left" | "center" | "right";

export const CenaComparativo: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);
  const ladoA = cena.texto ?? "A";
  const ladoB = cena.subtexto ?? "B";
  const labelA = (cena.rotuloA ?? cena.contexto ?? "A").toUpperCase();
  const labelB = (cena.rotuloB ?? "B").toUpperCase();

  if (cena.modelo_cena === "card") {
    return layout === "vertical" ? (
      <CardVertical
        cena={cena}
        opacity={opacity}
        reveal={reveal}
        sombra={sombra.cardOpacity}
        ladoA={ladoA}
        ladoB={ladoB}
        labelA={labelA}
        labelB={labelB}
      />
    ) : (
      <CardHorizontal
        cena={cena}
        opacity={opacity}
        reveal={reveal}
        sombra={sombra.cardOpacity}
        ladoA={ladoA}
        ladoB={ladoB}
        labelA={labelA}
        labelB={labelB}
      />
    );
  }

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <AmbientHud intensity={1} />
      <RegionHud anchor="tl" intensity={0.24} />
      <RegionHud anchor="br" intensity={0.16} />

      <div
        style={{
          position: "absolute",
          top: "48%",
          left: "50%",
          width: 1540,
          transform: "translate(-50%, -50%)",
          display: "grid",
          gridTemplateColumns: "1fr 150px 1fr",
          alignItems: "center",
          columnGap: 52,
        }}
      >
        <CompareSide
          label={labelA}
          text={ladoA}
          align="right"
          fontSize={fontSizeFor(ladoA, 118, 96, 78)}
          labelSize={26}
        />
        <VsHub cena={cena} mascotSize="medio" height={430} sapoTop={-230} vsSize={82} />
        <CompareSide
          label={labelB}
          text={ladoB}
          align="left"
          highlight
          fontSize={fontSizeFor(ladoB, 118, 96, 78)}
          labelSize={26}
        />
      </div>
    </AbsoluteFill>
  );
};

const CARD_H_BASE_W = 860; // inclui coluna do sapo + conteudo
const CARD_H_MAX_W = Math.round(CARD_H_BASE_W * 1.2); // ~1032
const CARD_H_HEIGHT = 360; // espaco vertical pro sapo caber dentro
const CARD_H_INSET_TOP = 90;
const CARD_H_INSET_LEFT = 200; // reserva canto sup-esq pro sapo
const CARD_H_INSET_RIGHT = 44;
const CARD_H_INSET_BOTTOM = 36;
const CARD_H_COL_GAP = 24;
const CARD_H_VS_COL = 90;
const CARD_H_SAPO_BOX = 170;
const CARD_H_SAPO_TOP = 10;
const CARD_H_SAPO_LEFT = 10;

function computeHorizontalLayout(textA: string, textB: string) {
  const longer = Math.max(textA.length, textB.length, 1);
  // Fonte preferida (mesma heuristica do fontSizeFor)
  let font = longer >= 16 ? 34 : longer >= 10 ? 42 : 48;
  const charW = 0.6; // largura media em ems para fonte display uppercase
  const fixed =
    CARD_H_VS_COL +
    CARD_H_INSET_LEFT +
    CARD_H_INSET_RIGHT +
    2 * CARD_H_COL_GAP;
  const neededW = 2 * (longer * font * charW) + fixed;
  const cardW = Math.min(CARD_H_MAX_W, Math.max(CARD_H_BASE_W, Math.ceil(neededW)));
  if (cardW >= CARD_H_MAX_W) {
    // Saturou no cap: recalcula fonte para caber sem vazar
    const availCol = (cardW - fixed) / 2;
    const maxFit = Math.floor(availCol / (longer * charW));
    font = Math.max(22, Math.min(font, maxFit));
  }
  return { cardW, font };
}

function CardHorizontal({
  cena,
  opacity,
  reveal,
  sombra,
  ladoA,
  ladoB,
  labelA,
  labelB,
}: {
  cena: CenaRemotion;
  opacity: number;
  reveal: number;
  sombra: number;
  ladoA: string;
  ladoB: string;
  labelA: string;
  labelB: string;
}) {
  const { cardW, font } = computeHorizontalLayout(ladoA, ladoB);
  const vsHeight = CARD_H_HEIGHT - CARD_H_INSET_TOP - CARD_H_INSET_BOTTOM;

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <AmbientHud intensity={0.62} />
      <RegionHud anchor="tl" intensity={0.26} />

      <div
        style={{
          position: "absolute",
          top: 126,
          left: 92,
          filter:
            "drop-shadow(0 14px 30px rgba(0,0,0,0.72)) drop-shadow(0 36px 90px rgba(0,0,0,0.58))",
        }}
      >
        <Chrome
          w={cardW}
          h={CARD_H_HEIGHT}
          hud={["grid", "circles-tl", "semicircles-tr", "dots-tr"]}
          idSuffix="comparativo-card-h"
          reveal={reveal}
          bgOpacity={sombra}
          showInnerLine={false}
          ghostStrokeWidth={8}
          outlineStrokeWidth={2.4}
          bracketStrokeWidth={16}
        >
          {cena.mascotMood !== "none" && (
            <div
              style={{
                position: "absolute",
                top: CARD_H_SAPO_TOP,
                left: CARD_H_SAPO_LEFT,
                width: CARD_H_SAPO_BOX,
                height: CARD_H_SAPO_BOX,
                zIndex: 3,
                pointerEvents: "none",
              }}
            >
              <MascotSpotlight />
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  filter:
                    "drop-shadow(0 0 10px rgba(155,207,227,0.45)) drop-shadow(0 4px 10px rgba(0,0,0,0.55))",
                }}
              >
                <Mascote mood={cena.mascotMood || "serio"} tamanho="pequeno" />
              </div>
            </div>
          )}

          <AutoFitText
            maxHeight={CARD_H_HEIGHT - CARD_H_INSET_TOP - CARD_H_INSET_BOTTOM}
            style={{
              position: "absolute",
              top: CARD_H_INSET_TOP,
              left: CARD_H_INSET_LEFT,
              right: CARD_H_INSET_RIGHT,
              bottom: CARD_H_INSET_BOTTOM,
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `1fr ${CARD_H_VS_COL}px 1fr`,
                alignItems: "center",
                columnGap: CARD_H_COL_GAP,
              }}
            >
              <CompareSide
                label={labelA}
                text={ladoA}
                align="right"
                fontSize={font}
                labelSize={16}
              />
              <VsHub
                cena={cena}
                mascotSize="pequeno"
                height={vsHeight}
                sapoTop={-72}
                vsSize={38}
                showMascot={false}
              />
              <CompareSide
                label={labelB}
                text={ladoB}
                align="left"
                highlight
                fontSize={font}
                labelSize={16}
              />
            </div>
          </AutoFitText>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
}

function CardVertical({
  cena,
  opacity,
  reveal,
  sombra,
  ladoA,
  ladoB,
  labelA,
  labelB,
}: {
  cena: CenaRemotion;
  opacity: number;
  reveal: number;
  sombra: number;
  ladoA: string;
  ladoB: string;
  labelA: string;
  labelB: string;
}) {
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>

      <div
        style={{
          position: "absolute",
          top: 112,
          left: 92,
        }}
      >
        <Chrome
          w={600}
          h={720}
          hud={["grid", "circles-tl", "dots-tr"]}
          idSuffix="comparativo-card-v"
          reveal={reveal}
          bgOpacity={sombra}
          showInnerLine={false}
          ghostStrokeWidth={7}
          outlineStrokeWidth={2.2}
          bracketStrokeWidth={14}
        >
          <AutoFitText
            maxHeight={590}
            style={{
              position: "absolute",
              inset: "74px 54px 52px",
              display: "grid",
              gridTemplateRows: "1fr 168px 1fr",
              alignItems: "center",
              rowGap: 24,
            }}
          >
            <CompareSide
              label={labelA}
              text={ladoA}
              align="center"
              fontSize={fontSizeFor(ladoA, 64, 54, 44)}
              labelSize={20}
            />
            <VsHub
              cena={cena}
              mascotSize="pequeno"
              height={168}
              sapoTop={0}
              vsSize={50}
              horizontal
              sapoPlacement="left"
            />
            <CompareSide
              label={labelB}
              text={ladoB}
              align="center"
              highlight
              fontSize={fontSizeFor(ladoB, 64, 54, 44)}
              labelSize={20}
            />
          </AutoFitText>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
}

function VsHub({
  cena,
  mascotSize,
  height,
  sapoTop,
  vsSize,
  horizontal = false,
  sapoPlacement = "top",
  showMascot = true,
}: {
  cena: CenaRemotion;
  mascotSize: "pequeno" | "medio";
  height: number;
  sapoTop: number;
  vsSize: number;
  horizontal?: boolean;
  sapoPlacement?: "top" | "left";
  showMascot?: boolean;
}) {
  const sapoBox = mascotSize === "medio" ? 280 : 200;
  const sapoStyle: CSSProperties =
    sapoPlacement === "left"
      ? {
          top: "50%",
          left: -72,
          transform: "translateY(-50%)",
        }
      : {
          top: sapoTop,
          left: "50%",
          transform: "translateX(-50%)",
        };

  return (
    <div
      style={{
        position: "relative",
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showMascot && cena.mascotMood !== "none" && (
        <div
          style={{
            position: "absolute",
            ...sapoStyle,
            width: sapoBox,
            height: sapoBox,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <MascotSpotlight />
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              filter:
                "drop-shadow(0 0 10px rgba(155,207,227,0.45)) drop-shadow(0 4px 10px rgba(0,0,0,0.55))",
            }}
          >
            <Mascote mood={cena.mascotMood || "serio"} tamanho={mascotSize} />
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: horizontal ? "50%" : 0,
          right: horizontal ? 0 : "auto",
          bottom: horizontal ? "auto" : 0,
          left: horizontal ? 0 : "50%",
          width: horizontal ? "100%" : 2,
          height: horizontal ? 2 : "100%",
          transform: horizontal ? "translateY(-50%)" : "translateX(-50%)",
          background: horizontal
            ? `linear-gradient(90deg, transparent, ${C.verdeMoldura} 18%, ${C.verdeMoldura} 82%, transparent)`
            : `linear-gradient(180deg, transparent, ${C.verdeMoldura} 18%, ${C.verdeMoldura} 82%, transparent)`,
          boxShadow: "0 0 24px rgba(106,170,132,0.35)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "12px 18px",
          background: "rgba(8,18,12,0.9)",
          border: `2px solid ${C.verdeMoldura}`,
          fontFamily: F.serifItalic,
          fontStyle: "italic",
          fontSize: `calc(${vsSize}px * var(--font-scale, 1))`,
          color: C.azulAcento,
          lineHeight: 1,
          textShadow: SH.textoSobreVideo,
        }}
      >
        vs.
      </div>
    </div>
  );
}

function MascotSpotlight() {
  return (
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
  );
}

function CompareSide({
  label,
  text,
  align,
  fontSize,
  labelSize,
  highlight = false,
}: {
  label: string;
  text: string;
  align: Align;
  fontSize: number;
  labelSize: number;
  highlight?: boolean;
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <MonoLabel text={label} size={labelSize} letterSpacing={6} color={C.brancoDim} />
      <div
        style={{
          marginTop: 18,
          fontFamily: F.display,
          fontSize: `calc(${fontSize}px * var(--font-scale, 1))`,
          fontWeight: 900,
          color: highlight ? C.azulAcento : C.branco,
          lineHeight: 0.94,
          letterSpacing: 0,
          textTransform: "uppercase",
          textShadow: SH.textoSobreVideo,
          overflowWrap: "normal",
          wordBreak: "keep-all",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function fontSizeFor(text: string, short: number, medium: number, long: number) {
  if (text.length >= 16) return long;
  if (text.length >= 10) return medium;
  return short;
}
