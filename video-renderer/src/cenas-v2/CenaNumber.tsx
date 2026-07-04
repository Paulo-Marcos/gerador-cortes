import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, SHADOWS_V2 as SH } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { AmbientHud, useFades} from "./_shared";
import { numeroFontSize } from "./_shared/numeroFit";

interface Props {
  cena: CenaRemotion;
}

/**
 * destaque_numerico — número gigante, reticles ao redor (mira de
 * crosshair). Sem moldura, sem sapo (igual ao leiaute anterior).
 */
export const CenaNumber: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, enter } = useFades({ frameLocal, fps, duracao, entryFrames: 20 });
  // Number counting animation
  const rawNumero = cena.numero ?? cena.texto ?? "";
  const target = typeof rawNumero === "number"
    ? rawNumero
    : Number(String(rawNumero).replace(/[^\d.-]/g, ""));
  const isNumeric = Number.isFinite(target) && target !== 0;
  const counted = Math.round(interpolate(enter, [0, 1], [0, target]));
  const sufixo = typeof rawNumero === "string" ? rawNumero.replace(/[\d.,-]/g, "") : "";
  const display = isNumeric ? `${counted.toLocaleString("pt-BR")}${sufixo}` : String(rawNumero);
  // Corpo derivado do valor FINAL (não do número animado) — mantém o tamanho
  // estável durante a contagem e evita que valores grandes estourem o anel.
  const finalDisplay = isNumeric ? `${target.toLocaleString("pt-BR")}${sufixo}` : String(rawNumero);
  const numeroSize = numeroFontSize(finalDisplay);

  return (
    <AbsoluteFill
      style={{
        opacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <AmbientHud intensity={0.55} scanline={false} ringsTL={false} />

      {/* Anel reticle de fundo */}
      <svg width={780} height={780} style={{ position: "absolute" }} viewBox="0 0 780 780">
        <g stroke={C.azulSoft} fill="none">
          <circle cx="390" cy="390" r="280" strokeWidth="1.5" strokeDasharray="6 8" />
          <circle cx="390" cy="390" r="340" strokeWidth="1" opacity="0.5" />
          <circle cx="390" cy="390" r="380" strokeWidth="1" opacity="0.3" />
        </g>
        <g stroke={C.azulAcento} strokeWidth="2.5">
          <line x1="0" y1="390" x2="50" y2="390" />
          <line x1="780" y1="390" x2="730" y2="390" />
          <line x1="390" y1="0" x2="390" y2="50" />
          <line x1="390" y1="780" x2="390" y2="730" />
        </g>
      </svg>

      <div
        style={{
          fontFamily: F.mono,
          fontSize: 24,
          letterSpacing: 7,
          color: C.azulAcento,
          fontWeight: 600,
          zIndex: 1,
        }}
      >
        {(cena.subtexto ?? "DADO").toUpperCase()}
      </div>

      <div
        style={{
          fontFamily: F.display,
          fontSize: numeroSize,
          fontWeight: 900,
          color: C.branco,
          lineHeight: 0.85,
          letterSpacing: "-0.04em",
          textShadow: "0 8px 30px rgba(0,0,0,0.8)",
          whiteSpace: "nowrap",
          zIndex: 1,
        }}
      >
        {display}
      </div>

      {cena.contexto && (
        <div style={{ display: "flex", alignItems: "center", gap: 18, zIndex: 1 }}>
          <div style={{ width: 60, height: 2, background: C.azulAcento }} />
          <div
            style={{
              fontFamily: F.display,
              fontSize: 44,
              fontWeight: 800,
              color: C.branco,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              textShadow: SH.textoSobreVideo,
            }}
          >
            {cena.contexto}
          </div>
          <div style={{ width: 60, height: 2, background: C.azulAcento }} />
        </div>
      )}

      {cena.fonte && (
        <div
          style={{
            fontFamily: F.mono,
            fontSize: 22,
            letterSpacing: 2.5,
            color: C.brancoMuted,
            zIndex: 1,
          }}
        >
          FONTE · {cena.fonte.toUpperCase()}
        </div>
      )}
    </AbsoluteFill>
  );
};
