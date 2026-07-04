import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import { AmbientHud, AutoFitText, Chrome, MonoLabel, RichTitle, MascotSpotlight, useCardLayout, useFades, useSombra } from "./_shared";
import type { RichTitlePart } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaLinhaTempo: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);
  const marcos = (cena.marcos ?? []).slice(0, 5);
  if (marcos.length === 0) return null;

  const trackProgress = spring({
    frame: frameLocal - 8,
    fps,
    config: { damping: 22, stiffness: 90 },
  });

  const titleParts: RichTitlePart[] = cena.texto ? [cena.texto.toUpperCase()] : ["LINHA DO TEMPO"];

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <AmbientHud intensity={0} scanline={false} />

        <div
          style={{
            position: "absolute",
            top: 112,
            left: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.74)) drop-shadow(0 28px 76px rgba(0,0,0,0.62))",
          }}
        >
          <Chrome
            w={610}
            h={780}
            hud={["grid", "circles-tl", "dots-tr"]}
            idSuffix="timeline-v"
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
              size={210}
              style={{ position: "absolute", top: 38, left: 28 }}
            />

            <AutoFitText maxHeight={180} style={{ position: "absolute", top: 72, right: 42, left: 232 }}>
              <MonoLabel text={(cena.contexto ?? "LINHA DO TEMPO").toUpperCase()} size={15} letterSpacing={4} />
              <div style={{ marginTop: 8 }}>
                <RichTitle parts={titleParts} size={34} maxWidth={320} />
              </div>
            </AutoFitText>

            <div
              style={{
                position: "absolute",
                top: 270,
                left: 96,
                width: 4,
                height: 430,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(180deg,
                    transparent 0%,
                    ${C.verdeMoldura} 8%,
                    ${C.azulAcento} 50%,
                    ${C.verdeMoldura} 92%,
                    transparent 100%)`,
                  boxShadow: "0 0 20px rgba(106,170,132,0.4)",
                  transform: `scaleY(${trackProgress})`,
                  transformOrigin: "top center",
                }}
              />

              {marcos.map((marco, idx) => {
                const yPct = marcos.length === 1 ? 50 : (idx / (marcos.length - 1)) * 100;
                const delayFrames = 10 + idx * 8;
                const itemEnter = spring({
                  frame: frameLocal - delayFrames,
                  fps,
                  config: { damping: 18, stiffness: 120 },
                });
                const itemOpacity = interpolate(itemEnter, [0, 1], [0, 1]);
                const itemScale = interpolate(itemEnter, [0, 1], [0.4, 1]);

                return (
                  <div
                    key={idx}
                    style={{
                      position: "absolute",
                      top: `${yPct}%`,
                      left: "50%",
                      transform: `translate(-50%, -50%) scale(${itemScale})`,
                      opacity: itemOpacity,
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: C.azulAcento,
                        border: `5px solid ${C.branco}`,
                        boxShadow: `0 0 26px ${C.azulSoft}`,
                      }}
                    />
                    <AutoFitText
                      maxHeight={Math.max(80, Math.floor(430 / Math.max(marcos.length, 1)) - 8)}
                      style={{
                        position: "absolute",
                        left: 54,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 410,
                      }}
                    >
                      <TimelineText marco={marco} dense />
                    </AutoFitText>
                  </div>
                );
              })}
            </div>
          </Chrome>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      <AmbientHud intensity={0.85} scanline={false} />
<Mascote mood={cena.mascotMood || "investigador"} tamanho="medio" />
      <div
        style={{
          position: "absolute",
          top: "8%",
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        
        <div style={{ textAlign: "left", marginLeft: 0 }}>
          <MonoLabel text={(cena.contexto ?? "LINHA DO TEMPO").toUpperCase()} size={24} letterSpacing={8} />
          <div style={{ marginTop: 8 }}>
            <RichTitle parts={titleParts} size={64} />
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "55%",
          left: 180,
          right: 180,
          height: 4,
          transform: "translateY(-50%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg,
              transparent 0%,
              ${C.verdeMoldura} 8%,
              ${C.azulAcento} 50%,
              ${C.verdeMoldura} 92%,
              transparent 100%)`,
            boxShadow: "0 0 20px rgba(106,170,132,0.4)",
            transform: `scaleX(${trackProgress})`,
            transformOrigin: "left center",
          }}
        />

        {marcos.map((marco, idx) => {
          const xPct = marcos.length === 1 ? 50 : (idx / (marcos.length - 1)) * 100;
          const isAcima = idx % 2 === 0;
          const delayFrames = 10 + idx * 8;
          const itemEnter = spring({
            frame: frameLocal - delayFrames,
            fps,
            config: { damping: 18, stiffness: 120 },
          });
          const itemOpacity = interpolate(itemEnter, [0, 1], [0, 1]);
          const itemScale = interpolate(itemEnter, [0, 1], [0.4, 1]);

          return (
            <div
              key={idx}
              style={{
                position: "absolute",
                top: "50%",
                left: `${xPct}%`,
                transform: `translate(-50%, -50%) scale(${itemScale})`,
                opacity: itemOpacity,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: C.azulAcento,
                  border: `5px solid ${C.branco}`,
                  boxShadow: `0 0 26px ${C.azulSoft}`,
                }}
              />
              <AutoFitText
                maxHeight={240}
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 320,
                  textAlign: "center",
                  ...(isAcima ? { bottom: 46 } : { top: 46 }),
                }}
              >
                <TimelineText marco={marco} />
              </AutoFitText>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const TimelineText: React.FC<{
  marco: { data: string; titulo: string; detalhe?: string };
  dense?: boolean;
}> = ({ marco, dense = false }) => (
  <>
    <div
      style={{
        fontFamily: F.mono,
        fontSize: `calc(${dense ? 26 : 34}px * var(--font-scale, 1))`,
        fontWeight: 700,
        letterSpacing: dense ? 1.4 : 2,
        color: C.azulAcento,
        textShadow: SH.textoSobreVideo,
      }}
    >
      {marco.data}
    </div>
    <div
      style={{
        marginTop: dense ? 3 : 6,
        fontFamily: F.display,
        fontSize: `calc(${dense ? 24 : 32}px * var(--font-scale, 1))`,
        fontWeight: 900,
        color: C.branco,
        lineHeight: 1.08,
        letterSpacing: "0.3px",
        textTransform: "uppercase",
        textShadow: SH.textoSobreVideo,
      }}
    >
      {marco.titulo}
    </div>
    {marco.detalhe && (
      <div
        style={{
          marginTop: dense ? 4 : 8,
          fontFamily: F.serifItalic,
          fontStyle: "italic",
          fontSize: `calc(${dense ? 20 : 26}px * var(--font-scale, 1))`,
          color: C.brancoMuted,
          lineHeight: 1.25,
          textShadow: SH.textoSobreVideo,
        }}
      >
        {marco.detalhe}
      </div>
    )}
  </>
);
