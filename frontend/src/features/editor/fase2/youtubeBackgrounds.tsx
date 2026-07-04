import { useId, useMemo, type FC } from 'react';
import { DEFAULT_YOUTUBE_BACKGROUND, type YoutubeBackgroundId } from './youtubeLayout';

/**
 * Fundos editoriais do layout compartilhado (handoff Claude Design "Layout
 * Backgrounds Final"). Todos procedurais — CSS + SVG inline, zero PNG — para
 * rodar no Remotion Player do preview. Paleta V2: verde quase preto, brackets
 * verde musgo, azul gelo HUD, calor marrom.
 */
export const PALETTE = {
  bg: '#0f1410',
  green: '#1a221c',
  greenDeep: '#0c1410',
  bracket: '#6aaa84',
  brown: '#3c2a22',
  brownWarm: '#5a3a28',
  hud: '#9bcfe3',
  lineBright: 'rgba(235,245,235,0.92)',
  lineSoft: 'rgba(235,245,235,0.40)',
  lineGhost: 'rgba(255,255,255,0.12)',
} as const;

// ─── Primitivas reutilizáveis ────────────────────────────────────────────────

const HudGrid: FC<{ size?: number; opacity?: number; color?: string }> = ({
  size = 160,
  opacity = 0.18,
  color = PALETTE.hud,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundImage: `
        linear-gradient(${color} 1px, transparent 1px),
        linear-gradient(90deg, ${color} 1px, transparent 1px)
      `,
      backgroundSize: `${size}px ${size}px`,
      opacity,
      mixBlendMode: 'screen',
    }}
  />
);

const Noise: FC<{ opacity?: number }> = ({ opacity = 0.18 }) => {
  const seed = useMemo(() => {
    const arr: string[] = [];
    let s = 1337;
    for (let i = 0; i < 28; i++) {
      s = (s * 9301 + 49297) % 233280;
      const x = s % 100;
      s = (s * 9301 + 49297) % 233280;
      const y = s % 100;
      s = (s * 9301 + 49297) % 233280;
      const r = 0.6 + ((s % 100) / 100) * 1.2;
      s = (s * 9301 + 49297) % 233280;
      const a = 0.04 + ((s % 100) / 100) * 0.06;
      arr.push(
        `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${a.toFixed(3)}) 0%, transparent ${r.toFixed(2)}%)`,
      );
    }
    return arr.join(', ');
  }, []);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: seed,
        mixBlendMode: 'overlay',
        opacity,
      }}
    />
  );
};

const Vignette: FC<{ warm?: boolean }> = ({ warm = false }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: `
        radial-gradient(ellipse at 30% 40%, rgba(42,58,50,0.35) 0%, transparent 55%),
        ${warm ? 'radial-gradient(ellipse at 78% 65%, rgba(78,46,32,0.50) 0%, transparent 55%),' : ''}
        radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(6,10,8,0.85) 100%)
      `,
    }}
  />
);

const TickRow: FC<{ count?: number }> = ({ count = 12 }) => (
  <div style={{ display: 'flex', gap: 0 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{
          width: 1,
          height: i % 4 === 0 ? 14 : 7,
          background: PALETTE.lineSoft,
          marginRight: 18,
        }}
      />
    ))}
  </div>
);

const ConcentricCircles: FC<{ size?: number; opacity?: number; dotted?: boolean }> = ({
  size = 240,
  opacity = 0.45,
  dotted = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ opacity }}>
    <circle
      cx="50"
      cy="50"
      r="48"
      fill="none"
      stroke={PALETTE.hud}
      strokeWidth="0.4"
      strokeDasharray={dotted ? '0.5 1.5' : 'none'}
    />
    <circle cx="50" cy="50" r="36" fill="none" stroke={PALETTE.hud} strokeWidth="0.4" />
    <circle
      cx="50"
      cy="50"
      r="24"
      fill="none"
      stroke={PALETTE.hud}
      strokeWidth="0.3"
      strokeDasharray="0.5 2"
    />
    <circle cx="50" cy="50" r="12" fill="none" stroke={PALETTE.hud} strokeWidth="0.3" />
    <circle cx="50" cy="50" r="1" fill={PALETTE.hud} />
  </svg>
);

const DotMatrix: FC<{
  rows?: number;
  cols?: number;
  gap?: number;
  dot?: number;
  opacity?: number;
  color?: string;
}> = ({ rows = 6, cols = 10, gap = 18, dot = 2, opacity = 0.6, color = PALETTE.hud }) => {
  return (
    <svg width={cols * gap} height={rows * gap} style={{ opacity }}>
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <circle
            key={`${r}-${c}`}
            cx={c * gap + dot}
            cy={r * gap + dot}
            r={dot / 2}
            fill={color}
          />
        )),
      )}
    </svg>
  );
};

const Semicircles: FC<{ size?: number; opacity?: number; side?: 'left' | 'right' }> = ({
  size = 360,
  opacity = 0.55,
  side = 'right',
}) => {
  const rotate = side === 'right' ? 0 : 180;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ opacity, transform: `rotate(${rotate}deg)` }}
    >
      <g stroke={PALETTE.hud} fill="none">
        <path d="M 100 10 A 90 40 0 0 0 100 90" strokeWidth="0.4" strokeDasharray="0.5 1.5" />
        <path d="M 100 18 A 70 32 0 0 0 100 82" strokeWidth="0.45" />
        <path d="M 100 28 A 52 22 0 0 0 100 72" strokeWidth="0.4" strokeDasharray="0.5 2" />
        <path d="M 100 38 A 34 12 0 0 0 100 62" strokeWidth="0.35" />
        <circle cx="100" cy="50" r="1" fill={PALETTE.hud} stroke="none" />
      </g>
    </svg>
  );
};

// Curvas de nível topográficas — máscara radial faz desbotar nas bordas.
const TopoLines: FC<{
  opacity?: number;
  strokeWidth?: number;
  rings?: number;
  spin?: number;
  secondary?: boolean;
}> = ({ opacity = 0.5, strokeWidth = 1.1, rings = 14, spin = 3, secondary = false }) => {
  const id = useId();
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <defs>
        <radialGradient id={`${id}-grad`} cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="white" stopOpacity="0.95" />
          <stop offset="60%" stopColor="white" stopOpacity="0.5" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="1920" height="1080" fill={`url(#${id}-grad)`} />
        </mask>
      </defs>
      <g stroke={PALETTE.hud} fill="none" strokeWidth={strokeWidth} mask={`url(#${id}-mask)`}>
        {Array.from({ length: rings }).map((_, i) => {
          const r = 120 + i * 80;
          return (
            <ellipse
              key={i}
              cx="960"
              cy="540"
              rx={r * 1.1}
              ry={r * 0.7}
              transform={`rotate(${i * spin} 960 540)`}
              strokeDasharray={i % 3 === 0 ? 'none' : '5 7'}
            />
          );
        })}
        {secondary &&
          Array.from({ length: 8 }).map((_, i) => {
            const r = 60 + i * 50;
            return (
              <ellipse key={`b${i}`} cx="280" cy="820" rx={r * 1.2} ry={r * 0.8} opacity="0.6" />
            );
          })}
      </g>
    </svg>
  );
};

// ─── Variantes (ordem do usuário: G, H, I, B, D, F) ─────────────────────────

// G · HUD Forte — grade dupla + semicírculos + concêntricas + dot matrix.
const BgHudForte: FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse 80% 70% at 50% 50%, rgba(34,52,42,0.75) 0%, rgba(10,16,12,1) 75%),
        linear-gradient(180deg, #0e1410 0%, #060a08 100%)
      `,
    }}
  >
    <HudGrid size={160} opacity={0.32} />
    <HudGrid size={32} opacity={0.1} />
    <div style={{ position: 'absolute', top: 100, right: 320 }}>
      <ConcentricCircles size={220} opacity={0.5} />
    </div>
    <div style={{ position: 'absolute', top: '45%', right: -220, transform: 'translateY(-50%)' }}>
      <Semicircles size={520} opacity={0.55} />
    </div>
    <div style={{ position: 'absolute', top: '60%', left: -240, transform: 'translateY(-50%)' }}>
      <Semicircles size={460} opacity={0.35} side="left" />
    </div>
    <div style={{ position: 'absolute', bottom: 70, left: 320 }}>
      <DotMatrix rows={6} cols={10} gap={16} dot={2.4} opacity={0.55} />
    </div>
    <div
      style={{
        position: 'absolute',
        top: 200,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <TickRow count={28} />
    </div>
    <Noise opacity={0.1} />
  </div>
);

// H · Topo Estrutural — curvas de nível + tick marks.
const BgTopoEstrutural: FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse 70% 60% at 50% 50%, rgba(32,46,38,0.55) 0%, transparent 65%),
        radial-gradient(ellipse 50% 50% at 78% 60%, rgba(58,38,28,0.35) 0%, transparent 60%),
        linear-gradient(180deg, #0a100d 0%, #060a08 100%)
      `,
    }}
  >
    <TopoLines opacity={0.45} strokeWidth={1.1} rings={14} />
    <div
      style={{
        position: 'absolute',
        top: 200,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <TickRow count={20} />
    </div>
    <Noise opacity={0.1} />
    <Vignette />
  </div>
);

// I · HUD + Topo — grade sutil + curvas + semicírculos + dot matrix.
const BgHudTopoFusion: FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse 75% 65% at 50% 50%, rgba(32,48,40,0.70) 0%, rgba(10,14,11,1) 78%),
        linear-gradient(180deg, #0c120e 0%, #060a08 100%)
      `,
    }}
  >
    <HudGrid size={160} opacity={0.18} />
    <TopoLines opacity={0.4} strokeWidth={1.0} rings={11} spin={4} />
    <div style={{ position: 'absolute', top: 100, right: 300 }}>
      <ConcentricCircles size={200} opacity={0.4} dotted />
    </div>
    <div style={{ position: 'absolute', top: '45%', right: -200, transform: 'translateY(-50%)' }}>
      <Semicircles size={480} opacity={0.45} />
    </div>
    <div style={{ position: 'absolute', bottom: 70, left: 320 }}>
      <DotMatrix rows={5} cols={9} gap={16} dot={2.2} opacity={0.45} />
    </div>
    <Noise opacity={0.1} />
  </div>
);

// B · Architectural HUD — grade técnica + semicírculos + concêntricas + dots.
const BgArchitecturalHud: FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse 90% 70% at 50% 50%, rgba(28,42,34,0.85) 0%, rgba(12,18,14,1) 75%),
        linear-gradient(180deg, #0e1410 0%, #080c09 100%)
      `,
    }}
  >
    <HudGrid size={160} opacity={0.3} />
    <div style={{ position: 'absolute', top: 90, right: 280 }}>
      <ConcentricCircles size={200} opacity={0.45} />
    </div>
    <div style={{ position: 'absolute', top: '50%', right: -180, transform: 'translateY(-50%)' }}>
      <Semicircles size={420} opacity={0.45} />
    </div>
    <div style={{ position: 'absolute', bottom: 70, left: 280 }}>
      <DotMatrix rows={5} cols={9} gap={16} dot={2.4} opacity={0.55} />
    </div>
    <div
      style={{
        position: 'absolute',
        top: 200,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <TickRow count={24} />
    </div>
    <Noise opacity={0.1} />
  </div>
);

// D · Topographic — só as curvas de nível, limpo e contemplativo.
const BgTopographic: FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse 70% 60% at 50% 50%, rgba(32,46,38,0.55) 0%, transparent 65%),
        radial-gradient(ellipse 50% 50% at 78% 60%, rgba(58,38,28,0.35) 0%, transparent 60%),
        linear-gradient(180deg, #0a100d 0%, #060a08 100%)
      `,
    }}
  >
    <TopoLines opacity={0.5} strokeWidth={1.1} rings={14} secondary />
    <Noise opacity={0.1} />
    <Vignette />
  </div>
);

// F · Cosmograph — disco central + meridianos + arcos de sextante.
const BgCosmograph: FC = () => {
  const id = useId();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 80% 70% at 50% 50%, rgba(32,46,38,0.55) 0%, transparent 65%),
          radial-gradient(ellipse 40% 50% at 80% 55%, rgba(58,38,28,0.35) 0%, transparent 60%),
          linear-gradient(180deg, #0a100d 0%, #060a08 100%)
        `,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, opacity: 0.55 }}
      >
        <defs>
          <radialGradient id={`${id}-grad`} cx="0.5" cy="0.5" r="0.55">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="70%" stopColor="white" stopOpacity="0.5" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`${id}-mask`}>
            <rect width="1920" height="1080" fill={`url(#${id}-grad)`} />
          </mask>
        </defs>
        <g mask={`url(#${id}-mask)`} stroke={PALETTE.hud} fill="none">
          <circle cx="960" cy="540" r="460" strokeWidth="1.1" />
          <circle cx="960" cy="540" r="340" strokeWidth="0.8" strokeDasharray="5 7" />
          <circle cx="960" cy="540" r="220" strokeWidth="0.7" />
          <line x1="100" y1="540" x2="1820" y2="540" strokeWidth="0.9" strokeDasharray="10 10" />
          <line x1="960" y1="40" x2="960" y2="1040" strokeWidth="0.9" strokeDasharray="10 10" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const x1 = 960 + Math.cos(angle) * 220;
            const y1 = 540 + Math.sin(angle) * 220;
            const x2 = 960 + Math.cos(angle) * 460;
            const y2 = 540 + Math.sin(angle) * 460;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="0.7" />;
          })}
          <path d="M 360 540 A 600 600 0 0 1 1560 540" strokeWidth="0.9" />
          <path d="M 1560 540 A 600 600 0 0 1 360 540" strokeWidth="0.9" strokeDasharray="5 7" />
          <circle cx="960" cy="540" r="3" fill={PALETTE.hud} stroke="none" />
          <circle cx="960" cy="540" r="8" strokeWidth="0.6" />
        </g>
      </svg>
      <Noise opacity={0.1} />
      <Vignette />
    </div>
  );
};

// ─── Registro + dispatcher ───────────────────────────────────────────────────

const COMPONENTS: Record<YoutubeBackgroundId, FC> = {
  'hud-forte': BgHudForte,
  'topo-estrutural': BgTopoEstrutural,
  'hud-topo': BgHudTopoFusion,
  'architectural-hud': BgArchitecturalHud,
  topographic: BgTopographic,
  cosmograph: BgCosmograph,
};

export interface YoutubeBackgroundOption {
  id: YoutubeBackgroundId;
  letter: string;
  label: string;
  descricao: string;
}

export const YOUTUBE_BACKGROUND_OPTIONS: readonly YoutubeBackgroundOption[] = [
  {
    id: 'hud-forte',
    letter: 'G',
    label: 'HUD Forte',
    descricao:
      'Grade dupla + semicírculos + concêntricas + dot matrix + tick marks. Máxima identidade técnica.',
  },
  {
    id: 'topo-estrutural',
    letter: 'H',
    label: 'Topo Estrutural',
    descricao: 'Curvas de nível + tick marks. Filosófico, com cantos definidos.',
  },
  {
    id: 'hud-topo',
    letter: 'I',
    label: 'HUD + Topo',
    descricao: 'Grade HUD sutil + curvas + semicírculos + dot matrix. Equilíbrio.',
  },
  {
    id: 'architectural-hud',
    letter: 'B',
    label: 'Architectural HUD',
    descricao: 'Grade técnica + semicírculos + concêntricas + dot matrix + tick marks.',
  },
  {
    id: 'topographic',
    letter: 'D',
    label: 'Topographic',
    descricao: 'Só as curvas de nível. Mais limpo e contemplativo.',
  },
  {
    id: 'cosmograph',
    letter: 'F',
    label: 'Cosmograph',
    descricao: 'Disco central + meridianos + arcos de sextante. Carta astronômica.',
  },
];

/** Renderiza o fundo editorial escolhido, preenchendo o ancestral posicionado. */
export const YoutubeBackground: FC<{ fundo?: YoutubeBackgroundId }> = ({ fundo }) => {
  const Bg = COMPONENTS[fundo ?? DEFAULT_YOUTUBE_BACKGROUND];
  return <Bg />;
};

// ─── Mini-preview SVG line-art para o seletor de fundo ───────────────────────
// Substitui o codigo (letra G/H/I/B/D/F) por uma previa visual do estilo.
// Portado 1:1 de `design_reference/src/v3_pos.jsx > FundoThumb (1144-1169)`.
// viewBox 0 0 44 26, stroke fino vectorEffect=non-scaling-stroke,
// currentColor para mudar de cor por estado (ativo/inativo).
export const FundoThumb: FC<{ id: YoutubeBackgroundId; className?: string }> = ({
  id,
  className,
}) => {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke' as const,
    opacity: 0.85,
  };
  const grid = (gap: number, op: number) => {
    const lines: JSX.Element[] = [];
    for (let x = gap; x < 44; x += gap) {
      lines.push(
        <line
          key={`v${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={26}
          stroke="currentColor"
          strokeWidth={0.5}
          opacity={op}
        />,
      );
    }
    for (let y = gap; y < 26; y += gap) {
      lines.push(
        <line
          key={`h${y}`}
          x1={0}
          y1={y}
          x2={44}
          y2={y}
          stroke="currentColor"
          strokeWidth={0.5}
          opacity={op}
        />,
      );
    }
    return lines;
  };
  const contours = [4, 8, 13, 18].map((_d, i) => (
    <path
      key={i}
      d={`M0 ${20 - i * 2} Q 11 ${10 - i * 3} 22 ${18 - i * 2} T 44 ${12 - i * 2}`}
      {...common}
      opacity={0.7}
    />
  ));
  let body: JSX.Element;
  if (id === 'hud-forte') {
    body = (
      <>
        {grid(5, 0.5)}
        <circle cx={22} cy={26} r={14} {...common} />
        <circle cx={22} cy={26} r={9} {...common} />
        <circle cx={22} cy={13} r={4} {...common} />
      </>
    );
  } else if (id === 'topo-estrutural') {
    body = (
      <>
        {contours}
        <line x1={2} y1={2} x2={6} y2={2} stroke="currentColor" strokeWidth={0.8} />
        <line x1={2} y1={2} x2={2} y2={6} stroke="currentColor" strokeWidth={0.8} />
      </>
    );
  } else if (id === 'hud-topo') {
    body = (
      <>
        {grid(7, 0.3)}
        {contours.slice(0, 2)}
        <circle cx={36} cy={26} r={9} {...common} />
      </>
    );
  } else if (id === 'architectural-hud') {
    body = (
      <>
        {grid(6, 0.4)}
        <circle cx={22} cy={26} r={12} {...common} />
        <circle cx={22} cy={26} r={6} {...common} />
      </>
    );
  } else if (id === 'topographic') {
    body = <>{contours}</>;
  } else {
    body = (
      <>
        <circle cx={22} cy={13} r={7} {...common} />
        <ellipse cx={22} cy={13} rx={20} ry={7} {...common} />
        <ellipse cx={22} cy={13} rx={11} ry={11} {...common} />
        <line x1={2} y1={13} x2={42} y2={13} {...common} />
      </>
    );
  }
  return (
    <svg
      viewBox="0 0 44 26"
      width="100%"
      height="22"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ display: 'block', overflow: 'hidden' }}
    >
      {body}
    </svg>
  );
};
