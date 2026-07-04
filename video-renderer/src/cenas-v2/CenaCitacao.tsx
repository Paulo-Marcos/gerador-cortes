import { AbsoluteFill, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { Mascote } from "../Mascote";
import { useGlobalFrame } from "../frame-context";
import {
  AmbientHud,
  Chrome,
  LensLine,
  MonoLabel,
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

/**
 * citacao_autor — citação em serif italic com aspas grandes em azul-acento.
 *
 * Dois modos:
 *  - "padrao": layout fullscreen original (texto centralizado no quadro inteiro,
 *    com sapo inline com a atribuição).
 *  - "card":   citação dentro de uma moldura Chrome (vertical 520×760 ou
 *    horizontal 920×300), com sapo no spotlight do card. Mesmo padrão
 *    visual de CenaCard/CenaDefinicao/CenaEnfase.
 */
export const CenaCitacao: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, translateY, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const layout = useCardLayout(cena);

  const texto = cena.texto ?? "Só sei que nada sei.";
  const rotulo = (cena.contexto ?? "CITAÇÃO").toUpperCase();

  if (cena.modelo_cena === "card") {
    return layout === "vertical" ? (
      <CardVertical
        cena={cena}
        opacity={opacity}
        reveal={reveal}
        sombra={sombra.cardOpacity}
        texto={texto}
        rotulo={rotulo}
      />
    ) : (
      <CardHorizontal
        cena={cena}
        opacity={opacity}
        reveal={reveal}
        sombra={sombra.cardOpacity}
        texto={texto}
        rotulo={rotulo}
      />
    );
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      <AmbientHud intensity={1} />

      <AutoFitText
        maxHeight={800}
        style={{
          position: "absolute",
          inset: 0,
          padding: "120px 700px 100px 160px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 28,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <MonoLabel text={rotulo} size={24} letterSpacing={6} />

        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 28 }}>
          <BigQuote size={220} />
          <div
            style={{
              fontFamily: F.serifItalic,
              fontStyle: "italic",
              fontSize: `calc(76px * var(--font-scale, 1))`,
              fontWeight: 400,
              color: C.branco,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              textShadow: SH.textoSobreVideo,
            }}
          >
            {texto}”
          </div>
        </div>

        {(cena.autor || cena.obra) && (
          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 20 }}>
            <Mascote mood={cena.mascotMood || "pensativo"} tamanho="pequeno" />
            <div
              style={{
                width: 60,
                height: 5,
                marginLeft: "-7%",
                background: `linear-gradient(90deg, ${C.verdeMoldura}, transparent)`,
              }}
            />
            <div>
              {cena.autor && <Autor texto={cena.autor} size={36} />}
              {(cena.obra || cena.ano) && (
                <Obra texto={[cena.obra, cena.ano].filter(Boolean).join(" · ")} size={22} />
              )}
            </div>
          </div>
        )}
      </AutoFitText>
    </AbsoluteFill>
  );
};

// ─── Variantes em card ─────────────────────────────────────────────────────

function CardVertical({
  cena,
  opacity,
  reveal,
  sombra,
  texto,
  rotulo,
}: {
  cena: CenaRemotion;
  opacity: number;
  reveal: number;
  sombra: number;
  texto: string;
  rotulo: string;
}) {
  const temAtribuicao = Boolean(cena.autor || cena.obra || cena.ano);
  const tamanhoTexto = sizeFor(texto, 40, 34, 28);

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
          idSuffix="citacao-card-v"
          reveal={reveal}
          gridOpacity={0.08}
          bgOpacity={sombra}
          ghostStrokeWidth={6}
          outlineStrokeWidth={2}
          bracketStrokeWidth={12}
          showInnerLine={false}
        >
          {/* Kicker no topo */}
          <div style={{ position: "absolute", top: 46, left: 44 }}>
            <Kicker text={rotulo} compact />
          </div>

          {/* Sapo no spotlight, alinhado ao kicker (canto sup-dir) */}
          <MascotSpotlight
            mood={cena.mascotMood || "pensativo"}
            tamanho="medio"
            size={226}
            style={{ position: "absolute", right: 110, top: 30 }}
          />

          {/* Aspa decorativa fixa, atrás do texto */}
          <BigQuote
            size={150}
            style={{ position: "absolute", top: 240, left: 30 }}
          />

          {/* Texto da citação */}
          <AutoFitText
            maxHeight={temAtribuicao ? 280 : 380}
            style={{
              position: "absolute",
              top: 308,
              right: 44,
              left: 88,
              ...(temAtribuicao ? { height: 280 } : {}),
            }}
          >
            <div
              style={{
                fontFamily: F.serifItalic,
                fontStyle: "italic",
                fontSize: `calc(${tamanhoTexto}px * var(--font-scale, 1))`,
                fontWeight: 400,
                color: C.branco,
                lineHeight: 1.16,
                letterSpacing: "-0.005em",
                textShadow: SH.textoSobreVideo,
              }}
            >
              {texto}”
            </div>
          </AutoFitText>

          {/* Atribuição na base do card */}
          {temAtribuicao && (
            <div
              style={{
                position: "absolute",
                left: 44,
                right: 44,
                bottom: 56,
              }}
            >
              <LensLine width="55%" />
              <div style={{ marginTop: 16 }}>
                {cena.autor && <Autor texto={cena.autor} size={26} />}
                {(cena.obra || cena.ano) && (
                  <Obra texto={[cena.obra, cena.ano].filter(Boolean).join(" · ")} size={18} />
                )}
              </div>
            </div>
          )}

          {/* Linha-assinatura inferior (mesmo padrão de CenaCard/Definicao) */}
          <div
            style={{
              position: "absolute",
              left: 44,
              bottom: 34,
              width: 86,
              height: 2,
              background: C.azulAcento,
              opacity: 0.7,
            }}
          />
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
  texto,
  rotulo,
}: {
  cena: CenaRemotion;
  opacity: number;
  reveal: number;
  sombra: number;
  texto: string;
  rotulo: string;
}) {
  const temAtribuicao = Boolean(cena.autor || cena.obra || cena.ano);
  const tamanhoTexto = sizeFor(texto, 34, 28, 22);

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <RegionHud anchor="bl" intensity={0.5} />

      <div
        style={{
          position: "absolute",
          top: "13%",
          left: "4%",
          filter:
            "drop-shadow(0 10px 22px rgba(0,0,0,0.9)) drop-shadow(0 32px 70px rgba(0,0,0,0.9))",
        }}
      >
        <Chrome
          w={920}
          h={300}
          hud={["grid", "circles-tl", "semicircles-tr", "dots-tr", "scanline"]}
          idSuffix="citacao-card-h"
          reveal={reveal}
          bgOpacity={sombra}
          showInnerLine={false}
        >
          <MascotSpotlight
            mood={cena.mascotMood || "pensativo"}
            tamanho="pequeno"
            size={220}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}
          />

          {/* Aspa decorativa fixa no canto sup-dir */}
          <BigQuote
            size={110}
            style={{ position: "absolute", top: 28, left: 222 }}
          />

          <AutoFitText
            maxHeight={temAtribuicao ? 200 : 240}
            style={{
              position: "absolute",
              top: 32,
              right: 44,
              bottom: temAtribuicao ? 76 : 32,
              left: 232,
              boxSizing: "border-box",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              justifyContent: "center",
            }}
          >
            <Kicker text={rotulo} compact />
            <div
              style={{
                fontFamily: F.serifItalic,
                fontStyle: "italic",
                fontSize: `calc(${tamanhoTexto}px * var(--font-scale, 1))`,
                fontWeight: 400,
                color: C.branco,
                lineHeight: 1.18,
                letterSpacing: "-0.005em",
                textShadow: SH.textoSobreVideo,
              }}
            >
              {texto}”
            </div>
          </AutoFitText>

          {temAtribuicao && (
            <div
              style={{
                position: "absolute",
                left: 232,
                right: 44,
                bottom: 26,
              }}
            >
              {cena.autor && <Autor texto={cena.autor} size={22} />}
              {(cena.obra || cena.ano) && (
                <Obra texto={[cena.obra, cena.ano].filter(Boolean).join(" · ")} size={16} />
              )}
            </div>
          )}
        </Chrome>
      </div>
    </AbsoluteFill>
  );
}

// ─── Subcomponentes visuais ────────────────────────────────────────────────

const BigQuote: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <div
    style={{
      fontFamily: F.serifItalic,
      fontStyle: "italic",
      fontSize: size,
      lineHeight: 0.72,
      color: C.azulAcento,
      textShadow: "0 4px 18px rgba(0,0,0,0.7)",
      pointerEvents: "none",
      ...style,
    }}
  >
    “
  </div>
);

const Kicker: React.FC<{ text: string; compact?: boolean }> = ({ text, compact = false }) => (
  <div
    style={{
      fontFamily: F.mono,
      fontSize: compact ? 22 : 26,
      letterSpacing: compact ? 4 : 6,
      color: C.azulAcento,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: compact ? 10 : 14,
    }}
  >
    <div style={{ width: compact ? 30 : 42, height: 2, background: C.azulAcento }} />
    {text}
  </div>
);

const Autor: React.FC<{ texto: string; size: number }> = ({ texto, size }) => (
  <div
    style={{
      fontFamily: F.display,
      fontSize: `calc(${size}px * var(--font-scale, 1))`,
      fontWeight: 900,
      color: C.branco,
      letterSpacing: 4,
      textTransform: "uppercase",
      textShadow: SH.textoSobreVideo,
    }}
  >
    {texto}
  </div>
);

const Obra: React.FC<{ texto: string; size: number }> = ({ texto, size }) => (
  <div
    style={{
      marginTop: 6,
      fontFamily: F.mono,
      fontSize: `calc(${size}px * var(--font-scale, 1))`,
      letterSpacing: 3,
      color: C.brancoDim,
    }}
  >
    {texto}
  </div>
);

function sizeFor(text: string, large: number, medium: number, small: number) {
  if (text.length > 180) return small;
  if (text.length > 110) return medium;
  return large;
}
