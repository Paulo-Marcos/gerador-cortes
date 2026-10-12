import type { YoutubeSharedConfig, YoutubeSharedRect } from '@/types/youtubeLayout';

/**
 * Onde o card vertical encaixa no palco compartilhado (I-035, D-904).
 *
 * RN-28: a zona que o operador definiu (`zona_card`) vence; a chave ausente É
 * a regra automática, e é a ausência que deixa o corte herdar a zona do
 * projeto (RN-10). Espelha `domain/corte/zona_card.py` no backend — preview
 * e render precisam mostrar o mesmo card.
 */

/** Menor zona de cards aceita — o piso do encaixe no renderer. */
export const ZONA_CARD_MINIMA = { w: 240, h: 180 } as const;

const MARGEM = 48;
const MARGEM_TOPO = 96;
const RESPIRO = 28;

export function sharedVerticalCardZone(config: YoutubeSharedConfig): YoutubeSharedRect {
  const manual = normalizeZonaCard(config.zona_card);
  if (manual) return manual;
  return config.telas === 1 ? zonaAutomaticaUmaTela(config) : zonaAutomaticaDuasTelas(config);
}

/**
 * A zona que o operador definiu, ou `undefined` quando não definiu. Sem
 * fallback de propósito: a ausência é um valor (a regra automática), e
 * inventar um retângulo apagaria a herança (RN-10).
 */
export function normalizeZonaCard(value: unknown): YoutubeSharedRect | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<YoutubeSharedRect>;
  const numeros = [raw.x, raw.y, raw.w, raw.h].map((n) => Number(n));
  if (numeros.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, wBruto, hBruto] = numeros;
  const w = clamp(Math.trunc(wBruto), ZONA_CARD_MINIMA.w, 1920);
  const h = clamp(Math.trunc(hBruto), ZONA_CARD_MINIMA.h, 1080);
  return {
    x: clamp(Math.trunc(x), 0, 1920 - w),
    y: clamp(Math.trunc(y), 0, 1080 - h),
    w,
    h,
  };
}

export function zonasCardIguais(a?: YoutubeSharedRect, b?: YoutubeSharedRect): boolean {
  if (!a || !b) return !a && !b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function zonaAutomaticaUmaTela(config: YoutubeSharedConfig): YoutubeSharedRect {
  const tela = renderedSize(config.crop_tela, config.slot_tela);
  const telaRight = config.slot_tela.x + tela.w;
  const leftSpace = config.slot_tela.x - MARGEM - RESPIRO;
  const rightSpace = 1920 - telaRight - MARGEM - RESPIRO;
  const useRightSide = rightSpace > leftSpace;
  const left = useRightSide ? Math.min(1920 - MARGEM - 240, telaRight + RESPIRO) : MARGEM;
  const right = useRightSide ? 1920 - MARGEM : Math.max(left + 240, config.slot_tela.x - RESPIRO);
  const top = Math.max(56, Math.min(config.slot_tela.y, 1080 - 236));
  const bottom = Math.max(top + 180, Math.min(1080 - 56, config.slot_tela.y + tela.h));
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(Math.max(240, right - left)),
    h: Math.round(Math.max(180, bottom - top)),
  };
}

// I-035: 2 telas — borda externa fixa define topo/esquerda; a tela grande
// limita a direita e o facecam limita o alcance inferior. O topo usa respiro
// maior que a lateral para o card não colar no contorno do palco.
function zonaAutomaticaDuasTelas(config: YoutubeSharedConfig): YoutubeSharedRect {
  const left = MARGEM;
  const top = MARGEM_TOPO;
  const right = Math.min(Math.max(config.slot_tela.x - RESPIRO, left + 240), 1920 - MARGEM);
  const bottom = Math.min(Math.max(config.slot_facecam.y - RESPIRO, top + 180), 1080 - MARGEM);
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  };
}

function renderedSize(crop: YoutubeSharedRect, slot: YoutubeSharedRect) {
  const scale = Math.max(0.01, Math.min(slot.w / crop.w, slot.h / crop.h));
  return { w: crop.w * scale, h: crop.h * scale };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
