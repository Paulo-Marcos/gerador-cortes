import { describe, expect, it } from 'vitest';
import {
  DEFAULT_YOUTUBE_LAYOUT,
  sharedVerticalCardZone,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
} from '@/shared/palco/youtubeLayout';

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

// D-904 (RN-28): a zona que o operador definiu vence a regra automática; a
// ausência é a regra automática — e é o que deixa o corte herdar do projeto.
import {
  mergeSharedConfig,
  normalizeYoutubeLayout,
  normalizeZonaCard,
  resolveLayoutChain,
  sharedConfigEquals,
} from '@/shared/palco/youtubeLayout';

const MANUAL = rect(1400, 200, 440, 600);

describe('sharedVerticalCardZone — zona manual (D-904)', () => {
  it('a zona definida vence a regra automática, com 1 ou 2 telas', () => {
    expect(sharedVerticalCardZone(config({ zona_card: MANUAL }))).toEqual(MANUAL);
    expect(sharedVerticalCardZone(config({ telas: 1, zona_card: MANUAL }))).toEqual(MANUAL);
  });

  it('sem a chave, a regra automática segue igual', () => {
    expect(sharedVerticalCardZone(config())).toEqual(rect(48, 96, 424, 281));
  });

  it('zona ilegível cai na regra automática', () => {
    const cfg = { ...config(), zona_card: { x: 'a', y: 1, w: 300, h: 300 } as unknown as YoutubeSharedRect };
    expect(sharedVerticalCardZone(cfg)).toEqual(rect(48, 96, 424, 281));
  });

  it('a zona respeita o piso 240x180 e o quadro', () => {
    expect(normalizeZonaCard({ x: 1900, y: 1000, w: 10, h: 10 })).toEqual(
      rect(1920 - 240, 1080 - 180, 240, 180),
    );
    expect(normalizeZonaCard(undefined)).toBeUndefined();
    expect(normalizeZonaCard({ x: 10 })).toBeUndefined();
  });

  it('normalizar não materializa a zona (RN-10)', () => {
    expect(normalizeYoutubeLayout({ compartilhada: { telas: 2 } }).compartilhada.zona_card).toBeUndefined();
    expect(
      normalizeYoutubeLayout({ compartilhada: { zona_card: MANUAL } }).compartilhada.zona_card,
    ).toEqual(MANUAL);
  });

  it('o corte herda a zona do projeto e pode sobrepô-la', () => {
    const herdada = resolveLayoutChain({ modo_padrao: 'compartilhada' }, { compartilhada: { zona_card: MANUAL } });
    expect(herdada.compartilhada.zona_card).toEqual(MANUAL);
    const propria = rect(60, 500, 400, 500);
    const sobreposta = resolveLayoutChain(
      { compartilhada: { zona_card: propria } },
      { compartilhada: { zona_card: MANUAL } },
    );
    expect(sobreposta.compartilhada.zona_card).toEqual(propria);
  });

  it('o merge leva a zona da base e do override', () => {
    expect(mergeSharedConfig(config({ zona_card: MANUAL }), null).zona_card).toEqual(MANUAL);
    const outra = rect(60, 500, 400, 500);
    expect(mergeSharedConfig(config({ zona_card: MANUAL }), { zona_card: outra }).zona_card).toEqual(outra);
    expect(mergeSharedConfig(config(), { telas: 1 }).zona_card).toBeUndefined();
  });

  it('a igualdade de config enxerga a zona', () => {
    expect(sharedConfigEquals(config(), config({ zona_card: MANUAL }))).toBe(false);
    expect(sharedConfigEquals(config({ zona_card: MANUAL }), config({ zona_card: MANUAL }))).toBe(true);
  });
});

// D-904: o preview resolve a zona do SEGMENTO no instante, e o render
// (`resolver_zona_card_da_cena`) faz a mesma conta. Este teste fixa o lado da
// tela; `TestZonaCardDoSegmento` fixa o do backend com os mesmos números.
import { resolveSharedConfigAtTime } from '@/shared/palco/youtubeLayout';

describe('zona dos cards num segmento (D-904)', () => {
  const layout = (override: Partial<YoutubeSharedConfig>) =>
    normalizeYoutubeLayout({
      modo_padrao: 'compartilhada',
      regioes: [{ inicio: 10, fim: 20, modo: 'compartilhada', compartilhada: override }],
    });

  it('dentro do segmento vale a zona dele; fora, a do corte', () => {
    const l = layout({ zona_card: MANUAL });
    expect(sharedVerticalCardZone(resolveSharedConfigAtTime(l, 14))).toEqual(MANUAL);
    expect(sharedVerticalCardZone(resolveSharedConfigAtTime(l, 4))).toEqual(rect(48, 96, 424, 281));
  });

  it('segmento sem zona própria mantém a do corte', () => {
    const l = layout({ telas: 1 });
    expect(sharedVerticalCardZone(resolveSharedConfigAtTime(l, 14)).x).toBe(48);
  });
});
