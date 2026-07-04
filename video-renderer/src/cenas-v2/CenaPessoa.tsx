import { AbsoluteFill, Img, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { Chrome, MonoLabel, RegionHud, useCardLayout, useFades, useSombra } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

export const CenaPessoa: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);
  const subtextoInformativo = getInformativeSubtexto(cena.subtexto);
  const contextoBio = subtextoInformativo ? undefined : getBioContexto(cena.contexto);
  const metaPessoa = subtextoInformativo ?? [cena.ano, contextoBio].filter(Boolean).join(" · ");
  const obraReferencia = cena.obra ?? getReferenceContexto(cena.contexto, contextoBio) ?? cena.fonte;
  const nomeExibicao = getNomeExibicao(cena);
  const nomeVertical = getNomeTypography(nomeExibicao, "vertical");
  const nomeHorizontal = getNomeTypography(nomeExibicao, "horizontal");

  if (layout === "vertical") {
    return (
      <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
        <RegionHud anchor="tl" intensity={0.42} />

        <div
          style={{
            position: "absolute",
            top: 128,
            left: 92,
            filter:
              "drop-shadow(0 10px 22px rgba(0,0,0,0.76)) drop-shadow(0 28px 76px rgba(0,0,0,0.62))",
          }}
        >
          <Chrome
            w={460}
            h={590}
            hud={["grid", "circles-tl", "dots-tr"]}
            idSuffix="pessoa-v"
            reveal={reveal}
            bgOpacity={sombra.cardOpacity}
            gridOpacity={0.08}
            showInnerLine={false}
            ghostStrokeWidth={6}
            outlineStrokeWidth={2}
            bracketStrokeWidth={12}
          >
            <PortraitSlot cena={cena} style={{ position: "absolute", top: 50, left: 58, width: 300, height: 266 }} />

            <div style={{ position: "absolute", top: 342, right: 48, left: 58 }}>
              {metaPessoa && (
                <div
                  style={{
                    fontFamily: F.serifItalic,
                    fontStyle: "italic",
                    fontSize: 24,
                    color: C.azulAcento,
                    lineHeight: 1.15,
                  }}
                >
                  {metaPessoa}
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  fontFamily: F.display,
                  fontSize: nomeVertical.fontSize,
                  fontWeight: 900,
                  color: C.branco,
                  lineHeight: nomeVertical.lineHeight,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  textShadow: SH.textoSobreVideo,
                  overflowWrap: "break-word",
                  maxWidth: 354,
                }}
              >
                {nomeExibicao}
              </div>

              {obraReferencia && <ReferenceLine text={obraReferencia} style={{ marginTop: 20 }} />}
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
          top: "14%",
          left: "12%",
          filter:
            "drop-shadow(0 10px 22px rgba(0,0,0,0.78)) drop-shadow(0 28px 72px rgba(0,0,0,0.62))",
        }}
      >
        <Chrome
          w={800}
          h={200}
          hud={["grid", "circles-tl", "dots-tr", "semicircles-tr"]}
          idSuffix="pessoa"
          reveal={reveal}
          bgOpacity={sombra.cardOpacity}
        >
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            <PortraitSlot cena={cena} style={{ flex: "0 0 100px", margin: "40px 0 40px 50px" }} />

            <div
              style={{
                flex: 1,
                padding: "46px 60px 46px 36px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <MonoLabel text={(cena.subtexto ?? "FICHA").toUpperCase()} size={18} letterSpacing={5} />

              <div
                style={{
                  marginTop: 12,
                  fontFamily: F.display,
                  fontSize: nomeHorizontal.fontSize,
                  fontWeight: 900,
                  color: C.branco,
                  lineHeight: nomeHorizontal.lineHeight,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  textShadow: SH.textoSobreVideo,
                  overflowWrap: "break-word",
                }}
              >
                {nomeExibicao}
              </div>

              {cena.contexto && (
                <div
                  style={{
                    marginTop: 14,
                    fontFamily: F.serifItalic,
                    fontStyle: "italic",
                    fontSize: 34,
                    color: C.azulAcento,
                    lineHeight: 1.15,
                  }}
                >
                  {cena.contexto}
                </div>
              )}

              {(cena.ano || cena.obra) && (
                <MetaLine text={[cena.ano, cena.obra].filter(Boolean).join(" - ").toUpperCase()} style={{ marginTop: 22 }} />
              )}
            </div>
          </div>
        </Chrome>
      </div>
    </AbsoluteFill>
  );
};

function getNomeExibicao(cena: CenaRemotion) {
  return (cena.nome_curto ?? cena.texto ?? "").trim();
}

function getNomeTypography(nome: string, layout: "vertical" | "horizontal") {
  const length = nome.length;
  const words = nome.split(/\s+/).filter(Boolean).length;

  if (layout === "vertical") {
    if (length > 36 || words > 4) {
      return { fontSize: 28, lineHeight: 0.98 };
    }
    if (length > 26 || words > 3) {
      return { fontSize: 34, lineHeight: 0.98 };
    }
    return { fontSize: 40, lineHeight: 0.98 };
  }

  if (length > 36 || words > 4) {
    return { fontSize: 24, lineHeight: 1.02 };
  }
  if (length > 26 || words > 3) {
    return { fontSize: 29, lineHeight: 1.02 };
  }
  return { fontSize: 35, lineHeight: 1.0 };
}

function getInformativeSubtexto(subtexto?: string) {
  if (!subtexto) {
    return undefined;
  }

  return subtexto.toUpperCase().includes("FICHA") ? undefined : subtexto;
}

function getBioContexto(contexto?: string) {
  if (!contexto || looksLikeReference(contexto)) {
    return undefined;
  }

  return contexto;
}

function getReferenceContexto(contexto?: string, contextoBio?: string) {
  if (!contexto || contexto === contextoBio) {
    return undefined;
  }

  return contexto;
}

function looksLikeReference(texto: string) {
  return /^(obra|refer[eê]ncia|livro|texto)\s*:/i.test(texto.trim());
}

const PortraitSlot: React.FC<{ cena: CenaRemotion; style?: React.CSSProperties }> = ({ cena, style }) => (
  <div
    style={{
      border: "4px solid rgba(155,207,227,0.5)",
      background: "rgba(8,18,12,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      backgroundImage: cena.retrato_url
        ? undefined
        : "repeating-linear-gradient(45deg, transparent 0 14px, rgba(155,207,227,0.06) 14px 16px)",
      ...style,
    }}
  >
    {cena.retrato_url ? (
      <Img
        src={cena.retrato_url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
        }}
      />
    ) : (
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 14,
          letterSpacing: 3,
          color: "rgba(155,207,227,0.6)",
          textAlign: "center",
        }}
      >
        RETRATO
        <br />
        SLOT
      </div>
    )}
  </div>
);

const ReferenceLine: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, ...style }}>
    <div style={{ width: 42, height: 3, background: C.verdeMoldura, flex: "0 0 auto" }} />
    <span
      style={{
        fontFamily: F.serifItalic,
        fontStyle: "italic",
        fontSize: 24,
        color: C.brancoMuted,
        lineHeight: 1.15,
        textShadow: SH.textoSobreVideo,
      }}
    >
      {text}
    </span>
  </div>
);

const MetaLine: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, ...style }}>
    <div style={{ width: 42, height: 3, background: C.verdeMoldura }} />
    <span
      style={{
        fontFamily: F.mono,
        fontSize: 20,
        letterSpacing: 2.6,
        color: C.brancoMuted,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      {text}
    </span>
  </div>
);
