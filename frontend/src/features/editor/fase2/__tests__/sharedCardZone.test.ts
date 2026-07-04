import { describe, expect, it } from 'vitest';
import {
  DEFAULT_YOUTUBE_LAYOUT,
  sharedVerticalCardZone,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
} from '../youtubeLayout';

// I-035: a faixa do card e dinamica por layout YT. A borda externa fixa define
// topo/esquerda; a tela grande limita a direita; o facecam limita o alcance
// inferior. Estes valores DEVEM bater 1:1 com o backend
// (_zona_card_vertical_compartilhada em test_youtube_card_zone.py) — o preview
// Remotion e o render final precisam mostrar o mesmo card.

const MARGEM = 48;
const MARGEM_TOPO = 96;
const RESPIRO = 28;

function config(overrides: Partial<YoutubeSharedConfig> = {}): YoutubeSharedConfig {
  const base = DEFAULT_YOUTUBE_LAYOUT.compartilhada;
  return {
    telas: 2,
    crop_facecam: { ...base.crop_facecam },
    crop_tela: { ...base.crop_tela },
    slot_facecam: { ...base.slot_facecam },
    slot_tela: { ...base.slot_tela },
    ...overrides,
  };
}

const rect = (x: number, y: number, w: number, h: number): YoutubeSharedRect => ({ x, y, w, h });

describe('sharedVerticalCardZone — 2 telas', () => {
  it('default: borda fixa em cima/esquerda; telas limitam direita/baixo', () => {
    expect(sharedVerticalCardZone(config())).toEqual(rect(48, 96, 424, 281));
  });

  it('tela mais a direita alarga a zona', () => {
    const zona = sharedVerticalCardZone(config({ slot_tela: { x: 700, y: 150, w: 1100, h: 720 } }));
    expect(zona.x).toBe(48);
    expect(zona.w).toBe(700 - RESPIRO - MARGEM); // 624
    expect(zona.h).toBe(405 - RESPIRO - MARGEM_TOPO); // 281
  });

  it('tela mais a esquerda estreita a zona', () => {
    const zona = sharedVerticalCardZone(config({ slot_tela: { x: 420, y: 150, w: 1325, h: 720 } }));
    expect(zona.w).toBe(420 - RESPIRO - MARGEM); // 344
  });

  it('facecam mais baixo aumenta a altura', () => {
    const zona = sharedVerticalCardZone(
      config({ slot_facecam: { x: 54, y: 600, w: 340, h: 260 } }),
    );
    expect(zona.y).toBe(96);
    expect(zona.h).toBe(600 - RESPIRO - MARGEM_TOPO); // 476
    expect(zona.w).toBe(424);
  });

  it('zona nunca invade as telas', () => {
    const cfg = config({
      slot_tela: { x: 640, y: 150, w: 1180, h: 720 },
      slot_facecam: { x: 54, y: 480, w: 340, h: 260 },
    });
    const zona = sharedVerticalCardZone(cfg);
    expect(zona.x + zona.w).toBeLessThanOrEqual(cfg.slot_tela.x);
    expect(zona.y + zona.h).toBeLessThanOrEqual(cfg.slot_facecam.y);
  });

  it('piso de seguranca 240x180 com telas coladas na borda', () => {
    const zona = sharedVerticalCardZone(
      config({
        slot_tela: { x: 120, y: 60, w: 1325, h: 720 },
        slot_facecam: { x: 54, y: 120, w: 340, h: 260 },
      }),
    );
    expect(zona.w).toBe(240);
    expect(zona.h).toBe(180);
  });
});

describe('sharedVerticalCardZone — 1 tela (regressao)', () => {
  it('mantem o valor do ramo de 1 tela', () => {
    expect(sharedVerticalCardZone(config({ telas: 1 }))).toEqual(rect(48, 150, 424, 720));
  });
});
