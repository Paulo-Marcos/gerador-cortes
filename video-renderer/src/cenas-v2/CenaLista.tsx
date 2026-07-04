import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { Chrome, MonoLabel, RegionHud, RichTitle, MascotSpotlight, useCardLayout, useFades, useSombra } from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaLista: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const itens = (cena.itens ?? []).slice(0, 5);
  if (itens.length === 0) return null;

  const titleParts: RichTitlePart[] = cena.texto ? [cena.texto.toUpperCase(), { editorial: "?" }] : [];

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="tl" intensity={0.42} />

        <div
          style={{
            position: "absolute",
            top: 100,
            left: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.76)) drop-shadow(0 28px 76px rgba(0,0,0,0.64))",
          }}
        >
          <Chrome
            w={540}
            h={820}
            hud={["grid", "circles-tl", "dots-tr", "scanline"]}
            idSuffix="lista-v"
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
              tamanho="medio"
              size={210}
              style={{ position: "absolute", top: 42, left: 28 }}
            />

            <div style={{ position: "absolute", top: 78, right: 42, left: 330 }}>
              <MonoLabel text={`${itens.length} ${cena.contexto ?? "PONTOS"}`.toUpperCase()} size={20} letterSpacing={4} />
              {titleParts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <RichTitle parts={titleParts} size={32} maxWidth={270} />
                </div>
              )}
            </div>

            <div
              style={{
                position: "absolute",
                top: 320,
                right: 38,
                bottom: 44,
                left: 38,
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              {itens.map((item, idx) => (
                <ListItem key={idx} item={item} idx={idx} frameLocal={frameLocal} fps={fps} dense />
              ))}
            </div>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  const headerH = 180;
  const itemHeight = 96;
  const padding = 60;
  const cardH = Math.min(820, headerH + itens.length * itemHeight + padding);

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <RegionHud anchor="tl" intensity={0.55} />

      <div
        style={{
          position: "absolute",
          top: "8%",
          left: "4%",
          filter:
            "drop-shadow(0 10px 22px rgba(0,0,0,0.9)) drop-shadow(0 32px 70px rgba(0,0,0,0.9))",
        }}
      >
        <Chrome
          w={1080}
          h={cardH}
          hud={["grid", "circles-tl", "semicircles-tr", "dots-tr", "scanline"]}
          idSuffix="lista"
          reveal={reveal}
          bgOpacity={sombra.cardOpacity}
          showInnerLine={false}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "apresentador"}
            tamanho="pequeno"
            size={200}
            style={{ position: "absolute", left: 8, top: 8 }}
          />

          <div
            style={{
              position: "absolute",
              top: 28,
              right: 36,
              left: 220,
              height: 150,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <MonoLabel text={`${itens.length} ${cena.contexto ?? "PONTOS"}`.toUpperCase()} size={18} letterSpacing={5} />
            {titleParts.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <RichTitle parts={titleParts} size={36} />
              </div>
            )}
          </div>

          <div
            style={{
              position: "absolute",
              top: headerH,
              right: 32,
              bottom: 32,
              left: 32,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {itens.map((item, idx) => (
              <ListItem key={idx} item={item} idx={idx} frameLocal={frameLocal} fps={fps} />
            ))}
          </div>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
};

const ListItem: React.FC<{
  item: { titulo: string; detalhe?: string };
  idx: number;
  frameLocal: number;
  fps: number;
  dense?: boolean;
}> = ({ item, idx, frameLocal, fps, dense = false }) => {
  const itemEnter = spring({
    frame: frameLocal - (12 + idx * 6),
    fps,
    config: { damping: 22, stiffness: 110 },
  });
  const itemOpacity = interpolate(itemEnter, [0, 1], [0, 1]);
  const itemY = interpolate(itemEnter, [0, 1], [16, 0]);
  const badgeSize = dense ? 60 : 72;

  return (
    <div
      style={{
        display: "flex",
        gap: dense ? 16 : 22,
        alignItems: "flex-start",
        opacity: itemOpacity,
        transform: `translateY(${itemY}px)`,
      }}
    >
      <div
        style={{
          width: badgeSize,
          height: badgeSize,
          flexShrink: 0,
          border: `3px solid ${C.azulAcento}`,
          background: "rgba(8,18,12,0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
          position: "relative",
        }}
      >
        <span
          style={{
            fontFamily: F.serifItalic,
            fontStyle: "italic",
            fontSize: dense ? 38 : 46,
            color: C.azulAcento,
            lineHeight: 1,
            textShadow: SH.textoSobreVideo,
            fontWeight: 500,
          }}
        >
          {idx + 1}
        </span>
      </div>

      <div style={{ flex: 1, paddingTop: dense ? 0 : 4 }}>
        <div
          style={{
            fontFamily: F.display,
            fontSize: dense ? 26 : 29,
            fontWeight: 900,
            color: C.branco,
            lineHeight: 1.08,
            letterSpacing: "0.3px",
            textTransform: "uppercase",
            textShadow: SH.textoSobreVideo,
          }}
        >
          {item.titulo}
        </div>
        {item.detalhe && (
          <div
            style={{
              marginTop: dense ? 3 : 2,
              fontFamily: F.serifItalic,
              fontStyle: "italic",
              fontSize: dense ? 26 : 29,
              color: C.brancoMuted,
              lineHeight: 1.28,
            }}
          >
            {item.detalhe}
          </div>
        )}
      </div>
    </div>
  );
};
