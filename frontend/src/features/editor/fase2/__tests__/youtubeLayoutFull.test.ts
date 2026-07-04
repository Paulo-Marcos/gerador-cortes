/**
 * Testes do posicionamento FULL no contrato frontend (F-060).
 * Espelha backend/tests/domain/test_youtube_layout_full.py.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FULL_CONFIG,
  findMatchingFullPreset,
  fullConfigDoPreset,
  fundoPlacaDoPreset,
  isDefaultFullConfig,
  mergeFullConfig,
  normalizeYoutubeLayout,
  resolveFullConfigAtTime,
  sharedConfigDoPreset,
  sharedConfigFromFull,
} from '../youtubeLayout';

const CROP_PESSOA = { x: 200, y: 100, w: 960, h: 540 };
const SLOT_CENTRO = { x: 480, y: 270, w: 960, h: 540 };

describe('normalizeYoutubeLayout · full (F-060)', () => {
  it('layout sem full recebe o default (quadro inteiro)', () => {
    const layout = normalizeYoutubeLayout({ modo_padrao: 'full' });
    expect(layout.full).toEqual(DEFAULT_FULL_CONFIG);
  });

  it('full custom é preservado', () => {
    const layout = normalizeYoutubeLayout({
      modo_padrao: 'full',
      full: { crop: CROP_PESSOA, slot: SLOT_CENTRO },
    });
    expect(layout.full.crop).toEqual(CROP_PESSOA);
    expect(layout.full.slot).toEqual(SLOT_CENTRO);
  });

  it('slot é corrigido para a proporção do crop', () => {
    const layout = normalizeYoutubeLayout({
      modo_padrao: 'full',
      full: { crop: { x: 0, y: 0, w: 800, h: 600 }, slot: { x: 0, y: 0, w: 1920, h: 1080 } },
    });
    expect(layout.full.slot.h).toBe(1080);
    expect(layout.full.slot.w).toBe(1440);
  });

  it('cascade herda o full do projeto', () => {
    const projeto = { modo_padrao: 'full', full: { crop: CROP_PESSOA, slot: SLOT_CENTRO } };
    const layout = normalizeYoutubeLayout({ modo_padrao: 'full', regioes: [] }, projeto);
    expect(layout.full.crop).toEqual(CROP_PESSOA);
  });

  it('full_segmento opcional sobrevive à normalização', () => {
    const layout = normalizeYoutubeLayout({
      modo_padrao: 'full',
      full_segmento: { crop: CROP_PESSOA, slot: SLOT_CENTRO },
    });
    expect(layout.full_segmento?.crop).toEqual(CROP_PESSOA);
  });

  it('região full com override parcial é normalizada', () => {
    const layout = normalizeYoutubeLayout({
      modo_padrao: 'compartilhada',
      regioes: [{ inicio: 10, fim: 20, modo: 'full', full: { crop: CROP_PESSOA } }],
    });
    expect(layout.regioes[0].full?.crop).toEqual(CROP_PESSOA);
    expect(layout.regioes[0].full?.slot).toBeUndefined();
  });
});

describe('helpers full (F-060)', () => {
  it('mergeFullConfig aplica override parcial', () => {
    const merged = mergeFullConfig(DEFAULT_FULL_CONFIG, { crop: CROP_PESSOA });
    expect(merged.crop).toEqual(CROP_PESSOA);
    expect(merged.slot).toEqual(DEFAULT_FULL_CONFIG.slot);
  });

  it('isDefaultFullConfig identifica o default', () => {
    expect(isDefaultFullConfig(DEFAULT_FULL_CONFIG)).toBe(true);
    expect(isDefaultFullConfig({ crop: CROP_PESSOA, slot: DEFAULT_FULL_CONFIG.slot })).toBe(false);
  });

  it('sharedConfigFromFull gera config sintético de 1 tela', () => {
    const config = sharedConfigFromFull({ crop: CROP_PESSOA, slot: SLOT_CENTRO });
    expect(config.telas).toBe(1);
    expect(config.crop_tela).toEqual(CROP_PESSOA);
    expect(config.slot_tela).toEqual(SLOT_CENTRO);
  });

  it('resolveFullConfigAtTime usa o override do segmento ativo', () => {
    const outroCrop = { x: 0, y: 0, w: 1280, h: 720 };
    const layout = normalizeYoutubeLayout({
      modo_padrao: 'full',
      full: { crop: CROP_PESSOA, slot: SLOT_CENTRO },
      regioes: [{ inicio: 30, fim: 40, modo: 'full', full: { crop: outroCrop } }],
    });
    expect(resolveFullConfigAtTime(layout, 35).crop).toEqual(outroCrop);
    expect(resolveFullConfigAtTime(layout, 5).crop).toEqual(CROP_PESSOA);
  });
});

describe('presets de posicionamento (F-060)', () => {
  it('fullConfigDoPreset lê payload de posicionamento_full', () => {
    const preset = {
      tipo: 'posicionamento_full' as const,
      payload: {
        full: { crop: CROP_PESSOA, slot: SLOT_CENTRO },
        fundo: 'cosmograph',
        placa: { nome: 'A', papel: 'B' },
      },
    };
    expect(fullConfigDoPreset(preset)?.crop).toEqual(CROP_PESSOA);
    expect(fundoPlacaDoPreset(preset)).toEqual({
      fundo: 'cosmograph',
      placa: { nome: 'A', papel: 'B' },
    });
  });

  it('sharedConfigDoPreset aceita o shape novo {compartilhada, fundo, placa}', () => {
    const compartilhada = {
      telas: 1 as const,
      crop_facecam: { x: 24, y: 410, w: 340, h: 260 },
      crop_tela: CROP_PESSOA,
      slot_facecam: { x: 54, y: 405, w: 340, h: 260 },
      slot_tela: SLOT_CENTRO,
    };
    const preset = {
      tipo: 'posicionamento' as const,
      payload: { compartilhada, fundo: 'hud-topo' },
    };
    expect(sharedConfigDoPreset(preset)?.crop_tela).toEqual(CROP_PESSOA);
    expect(fundoPlacaDoPreset(preset)).toEqual({ fundo: 'hud-topo' });
  });

  it('sharedConfigDoPreset mantém compatibilidade com payload legado', () => {
    const legado = {
      telas: 2 as const,
      crop_facecam: { x: 24, y: 410, w: 340, h: 260 },
      crop_tela: CROP_PESSOA,
      slot_facecam: { x: 54, y: 405, w: 340, h: 260 },
      slot_tela: SLOT_CENTRO,
    };
    const preset = { tipo: 'posicionamento' as const, payload: legado };
    expect(sharedConfigDoPreset(preset)?.crop_tela).toEqual(CROP_PESSOA);
    expect(fundoPlacaDoPreset(preset)).toEqual({});
  });

  it('findMatchingFullPreset acha preset pelo posicionamento', () => {
    const presets = [
      {
        id: '1',
        nome: 'Pessoa centralizada',
        tipo: 'posicionamento_full' as const,
        payload: { full: { crop: CROP_PESSOA, slot: SLOT_CENTRO } },
      },
    ];
    const match = findMatchingFullPreset(presets, { crop: CROP_PESSOA, slot: SLOT_CENTRO });
    expect(match?.nome).toBe('Pessoa centralizada');
    expect(findMatchingFullPreset(presets, DEFAULT_FULL_CONFIG)).toBeNull();
  });
});
