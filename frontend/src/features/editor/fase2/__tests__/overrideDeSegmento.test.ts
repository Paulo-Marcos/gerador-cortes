import { describe, expect, it } from 'vitest';
import { DEFAULT_YOUTUBE_LAYOUT, type YoutubeSharedConfig } from '@/shared/palco/youtubeLayout';
import { overrideCompartilhadaDoSegmento, overrideFullDoSegmento } from '../overrideDeSegmento';

// O override do segmento é parcial (RN-10): só o que difere do corte.

const MANUAL = { x: 1400, y: 200, w: 440, h: 600 };

function config(overrides: Partial<YoutubeSharedConfig> = {}): YoutubeSharedConfig {
  return { ...DEFAULT_YOUTUBE_LAYOUT.compartilhada, ...overrides };
}

describe('overrideCompartilhadaDoSegmento', () => {
  it('sem diferença não grava override', () => {
    expect(overrideCompartilhadaDoSegmento(config(), config())).toBeUndefined();
  });

  it('só o que difere entra: telas e encaixes', () => {
    const slot = { x: 700, y: 150, w: 1100, h: 720 };
    expect(overrideCompartilhadaDoSegmento(config(), config({ telas: 1, slot_tela: slot }))).toEqual({
      telas: 1,
      slot_tela: slot,
    });
  });

  it('D-904: a zona dos cards entra quando o corte não tem ou quando difere', () => {
    expect(overrideCompartilhadaDoSegmento(config(), config({ zona_card: MANUAL }))).toEqual({
      zona_card: MANUAL,
    });
    const outra = { x: 60, y: 500, w: 400, h: 500 };
    expect(
      overrideCompartilhadaDoSegmento(config({ zona_card: MANUAL }), config({ zona_card: outra })),
    ).toEqual({ zona_card: outra });
    expect(
      overrideCompartilhadaDoSegmento(config({ zona_card: MANUAL }), config({ zona_card: MANUAL })),
    ).toBeUndefined();
  });
});

describe('overrideFullDoSegmento', () => {
  it('só o crop ou o slot que mudou', () => {
    const base = DEFAULT_YOUTUBE_LAYOUT.full;
    const crop = { x: 100, y: 50, w: 1600, h: 900 };
    expect(overrideFullDoSegmento(base, { ...base, crop })).toEqual({ crop });
    expect(overrideFullDoSegmento(base, base)).toBeUndefined();
  });
});
