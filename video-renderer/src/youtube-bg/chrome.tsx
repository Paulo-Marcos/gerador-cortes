import { useId, useMemo, type FC, type ReactNode } from "react";

/**
 * ESPELHO de frontend/src/features/editor/fase2/youtubeChrome.tsx (geometria +
 * chrome). Esta cópia (React 19) existe para o video-renderer rasterizar o
 * "palco" (brackets, molduras, sombra, placa) em PNG via Remotion still, usado
 * como camada de FRENTE no FFmpeg do render final (Variante A da F-020).
 *
 * `buildChromePaths`/`chromeClipPath` são IDÊNTICOS ao frontend — a geometria
 * do chanfro precisa casar 1:1 com o preview e com o crop/scale do FFmpeg.
 * Mantenha em sincronia.
 */

const PALETTE = {
  bracket: "#6aaa84",
  lineBright: "rgba(235,245,235,0.92)",
  lineSoft: "rgba(235,245,235,0.40)",
  lineGhost: "rgba(255,255,255,0.12)",
} as const;

export interface ChromeOpts {
  radius?: number;
  chamferTR?: number;
  chamferBR?: number;
  offset?: number;
  bracketLen?: number;
  ghostStrokeWidth?: number;
  outlineStrokeWidth?: number;
  bracketStrokeWidth?: number;
}

interface ChromePaths {
  main: string;
  inner: string;
  bracketTL: string;
  bracketBL: string;
  bracketBR: string;
  bracketTR: string;
  baseR: number;
  cTR: number;
  cBR: number;
  bkLen: number;
}

export function buildChromePaths(w: number, h: number, opts: ChromeOpts = {}): ChromePaths {
  const baseR = opts.radius ?? Math.max(12, Math.min(35, h * 0.077));
  const cTR = opts.chamferTR ?? Math.max(20, Math.min(90, h * 0.193));
  const cBR = opts.chamferBR ?? Math.max(10, Math.min(40, h * 0.085));
  const offset = opts.offset ?? 12;

  const main =
    `M ${baseR},0 L ${w - cTR},0 L ${w},${cTR} L ${w},${h - cBR} L ${w - cBR},${h} L ${baseR},${h} ` +
    `A ${baseR},${baseR} 0 0 1 0,${h - baseR} L 0,${baseR} A ${baseR},${baseR} 0 0 1 ${baseR},0 Z`;

  const innerR = Math.max(2, baseR - offset);
  const inner =
    `M ${baseR},${offset} L ${w - cTR - 6},${offset} L ${w - offset},${cTR + 6} L ${w - offset},${h - cBR - 4} L ${w - cBR - 4},${h - offset} L ${baseR},${h - offset} ` +
    `A ${innerR},${innerR} 0 0 1 ${offset},${h - baseR} L ${offset},${baseR} A ${innerR},${innerR} 0 0 1 ${baseR},${offset} Z`;

  const bkLen = opts.bracketLen ?? baseR * 3.5;

  const bracketTL = `M ${bkLen},0 L ${baseR},0 A ${baseR},${baseR} 0 0 0 0,${baseR} L 0,${bkLen}`;
  const bracketBL = `M 0,${h - bkLen} L 0,${h - baseR} A ${baseR},${baseR} 0 0 0 ${baseR},${h} L ${bkLen},${h}`;
  const bracketBR = `M ${w - cBR - bkLen * 0.8},${h} L ${w - cBR},${h} L ${w},${h - cBR} L ${w},${h - cBR - bkLen * 0.8}`;
  const bracketTR = `M ${w - cTR - bkLen * 0.8},0 L ${w - cTR},0 L ${w},${cTR} L ${w},${cTR + bkLen * 0.8}`;

  return { main, inner, bracketTL, bracketBL, bracketBR, bracketTR, baseR, cTR, cBR, bkLen };
}

/** CSS clip-path do contorno principal — mesma forma do chrome. */
export function chromeClipPath(width: number, height: number, opts: ChromeOpts = {}): string {
  return `path("${buildChromePaths(width, height, opts).main}")`;
}

/** Tamanho renderizado do vídeo no slot (encaixe proporcional). Igual ao
 *  frontend e ao `_proportional_size` do FFmpeg. */
export function renderedSize(
  crop: { w: number; h: number },
  slot: { w: number; h: number },
): { w: number; h: number } {
  const scale = Math.max(0.01, Math.min(slot.w / crop.w, slot.h / crop.h));
  return { w: crop.w * scale, h: crop.h * scale };
}

export const CardChrome: FC<{
  width: number;
  height: number;
  opts?: ChromeOpts;
  bracketScale?: number;
  outlineScale?: number;
  showInner?: boolean;
  showBrackets?: boolean;
  brackets?: { tl?: boolean; tr?: boolean; bl?: boolean; br?: boolean };
}> = ({
  width,
  height,
  opts = {},
  bracketScale = 1,
  outlineScale = 1,
  showInner = true,
  showBrackets = true,
  brackets = { tl: true, tr: true, bl: true, br: true },
}) => {
  const paths = useMemo(() => buildChromePaths(width, height, opts), [width, height, opts]);
  const ghostStroke = (opts.ghostStrokeWidth ?? Math.max(6, height * 0.025)) * outlineScale;
  const outlineStroke = (opts.outlineStrokeWidth ?? Math.max(2.5, height * 0.008)) * outlineScale;
  const bracketStroke = (opts.bracketStrokeWidth ?? Math.max(10, height * 0.044)) * bracketScale;
  const id = useId();

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <pattern id={`tex-${id}`} patternUnits="userSpaceOnUse" width="5" height="5">
          <rect width="5" height="5" fill={PALETTE.bracket} />
          <line x1="0" y1="0.8" x2="5" y2="0.8" stroke="rgba(0,0,0,0.32)" strokeWidth="1" />
          <line x1="0" y1="3.5" x2="5" y2="3.5" stroke="rgba(255,255,255,0.16)" strokeWidth="0.7" />
        </pattern>
        <filter id={`sh-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.45" />
        </filter>
      </defs>

      <path d={paths.main} fill="none" stroke={PALETTE.lineGhost} strokeWidth={ghostStroke} />
      <path d={paths.main} fill="none" stroke={PALETTE.lineBright} strokeWidth={outlineStroke} strokeLinejoin="miter" />
      {showInner && (
        <path d={paths.inner} fill="none" stroke={PALETTE.lineSoft} strokeWidth={1.4 * outlineScale} strokeLinejoin="miter" />
      )}
      {showBrackets && (
        <g fill="none" stroke={`url(#tex-${id})`} strokeWidth={bracketStroke} strokeLinejoin="round" filter={`url(#sh-${id})`}>
          {brackets.tl && <path d={paths.bracketTL} />}
          {brackets.bl && <path d={paths.bracketBL} />}
          {brackets.br && <path d={paths.bracketBR} />}
          {brackets.tr && <path d={paths.bracketTR} />}
        </g>
      )}
    </svg>
  );
};

export const SPEAKER_LABEL_HEIGHT = 68;
export const SPEAKER_LABEL_GAP_FROM_IMAGE = 20;

/** Etiqueta do interlocutor — fica ACIMA da tela principal, alinhada à esquerda. */
export const SpeakerLabel: FC<{
  left: number;
  top: number;
  nome?: string;
  papel?: string;
}> = ({ left, top, nome, papel }) => {
  if (!nome && !papel) return null;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        height: SPEAKER_LABEL_HEIGHT,
        padding: "14px 24px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 18,
        pointerEvents: "none",
        border: "1px solid rgba(235,245,235,0.28)",
        borderRadius: 12,
        background: "linear-gradient(90deg, rgba(4,8,6,0.92) 0%, rgba(4,8,6,0.74) 72%, rgba(4,8,6,0.18) 100%)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.38)",
      }}
    >
      {nome ? (
        <div
          style={{
            fontFamily: '"Inter", sans-serif',
            fontWeight: 850,
            fontSize: 32,
            letterSpacing: 0,
            color: "#ffffff",
            lineHeight: 1,
            textShadow: "0 2px 8px rgba(0,0,0,0.75)",
            whiteSpace: "nowrap",
          }}
        >
          {nome}
        </div>
      ) : null}
      {nome && papel ? (
        <div
          style={{
            width: 1,
            height: 32,
            flex: "0 0 auto",
            background: "rgba(235,245,235,0.32)",
          }}
        />
      ) : null}
      {papel ? (
        <div
          style={{
            minWidth: 0,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 0,
            color: "#86e28f",
            lineHeight: 1,
            textShadow: "0 2px 6px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap",
          }}
        >
          {papel}
        </div>
      ) : null}
    </div>
  );
};

/** Chrome do palco — contorno + 4 brackets, com padding interno. */
export const StageChrome: FC<{ pad?: number }> = ({ pad = 32 }) => {
  const opts: ChromeOpts = { radius: 24, chamferTR: 52, chamferBR: 30, offset: 12, bracketLen: 62 };
  return (
    <div style={{ position: "absolute", left: pad, top: pad, right: pad, bottom: pad, pointerEvents: "none" }}>
      <CardChrome width={1920 - pad * 2} height={1080 - pad * 2} opts={opts} bracketScale={0.36} outlineScale={0.3} />
    </div>
  );
};

/** Posiciona um filho num retângulo absoluto do palco 1920x1080. */
export const SlotBox: FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  clip?: boolean;
  opts?: ChromeOpts;
  children: ReactNode;
}> = ({ x, y, w, h, clip = false, opts = {}, children }) => {
  const clipPath = clip ? chromeClipPath(w, h, opts) : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        clipPath,
        WebkitClipPath: clipPath,
      }}
    >
      {children}
    </div>
  );
};
