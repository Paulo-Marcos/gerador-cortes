/**
 * Kit de estilo compartilhado pelas cenas do CenaOverlay (E-006).
 * Paleta, dimensões do palco, helpers de CSS e o componente Mascote.
 * Espelha video-renderer/src/theme.ts — mantê-los sincronizados.
 */
import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Paleta natural do mascote — espelha video-renderer/src/theme.ts
// ---------------------------------------------------------------------------
export const C = {
  verdePrimario: '#3FA66A',
  verdeProfundo: '#1F5132',
  azulLagoa: '#4FA8C9',
  azulNoite: '#173E55',
  ouroOlho: '#FFD93D',
  brancoNeve: '#F5F5F5',
} as const;

export const STAGE_W = 1920;
export const STAGE_H = 1080;

const TAMANHO_PX: Record<string, number> = {
  mini: 140,
  pequeno: 200,
  medio: 280,
  grande: 400,
  extraGrande: 600,
};

// Nomes de arquivo do mascote do canal (dados servidos por canal): o naming
// genérico é da pasta/URL (/mascote/); os arquivos mantêm o nome fornecido.
const MASCOTE_FILE: Record<string, string> = {
  pensativo: 'sapo_pensativo.png',
  serio: 'sapo_serio.png',
  animado: 'sapo_animado.png',
  investigador: 'sapo_investigador.png',
  apresentador: 'sapo_apresentador.png',
};

// ---------------------------------------------------------------------------
// Helpers de estilo
// ---------------------------------------------------------------------------

/** Parseia "left:5%;top:18%;gap:36px;" → CSSProperties */
export function css(raw: string): CSSProperties {
  const out: Record<string, string> = {};
  raw.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx < 1) return;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val;
  });
  return out as CSSProperties;
}

export const cardBase: CSSProperties = {
  background: 'rgba(10,10,20,0.88)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
};

export function cluster(extra: string): CSSProperties {
  return { position: 'absolute', display: 'flex', alignItems: 'center', ...css(extra) };
}

export function textoTitulo(size: number, weight: number): CSSProperties {
  return {
    fontSize: size,
    fontWeight: weight,
    color: C.brancoNeve,
    margin: 0,
    lineHeight: 1.1,
    letterSpacing: '-1.5px',
    textShadow: '0 4px 16px rgba(0,0,0,0.85)',
  };
}

function mascoteStyle(tamanho: string): CSSProperties {
  const px = TAMANHO_PX[tamanho] ?? TAMANHO_PX.pequeno;
  return {
    width: px,
    height: px,
    objectFit: 'contain',
    flexShrink: 0,
    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
  };
}

function mascoteSrc(mood?: string): string {
  const file = MASCOTE_FILE[mood ?? 'pensativo'] ?? MASCOTE_FILE.pensativo;
  return `/mascote/${file}`;
}

// Mascote do canal desabilitado por padrao (D-179): so renderiza quando
// VITE_CANAL_MASCOTE_HABILITADO === 'true'. Mesma logica default-off do Remotion
// (MascotSpotlight). Coloque `true` no env do seu canal para habilitar.
const MASCOTE_HABILITADO = import.meta.env.VITE_CANAL_MASCOTE_HABILITADO === 'true';

// Mascote do canal inline
export function Mascote({ tamanho, mood }: { tamanho: string; mood?: string }) {
  if (!MASCOTE_HABILITADO) return null;
  return <img src={mascoteSrc(mood)} alt="mascote do canal" style={mascoteStyle(tamanho)} />;
}
