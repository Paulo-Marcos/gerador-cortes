import { describe, expect, it } from 'vitest';
import type { YoutubeSharedConfig } from '@/shared/palco/youtubeLayout';
import * as padrao from '../youtubeLayoutPadrao';
import { fullFromSynthetic, origemDoTipoDoProjeto, padraoComPosicionamento } from '../youtubeLayoutPadrao';

// D-970: restos da D-966 (herança do modo, RN-10).

describe('origemDoTipoDoProjeto — de onde vem o tipo do projeto', () => {
  it('o projeto que grava o modo é a origem', () => {
    expect(origemDoTipoDoProjeto('{"modo_padrao":"full"}', '{"modo_padrao":"compartilhada"}')).toBe(
      'projeto',
    );
  });

  it('o projeto sem modo herda do Global que grava um', () => {
    expect(origemDoTipoDoProjeto('{"fundo":"hud-topo"}', '{"modo_padrao":"compartilhada"}')).toBe(
      'global',
    );
    expect(origemDoTipoDoProjeto('{}', '{"modo_padrao":"full"}')).toBe('global');
    expect(origemDoTipoDoProjeto(null, '{"modo_padrao":"full"}')).toBe('global');
  });

  it('ninguém grava modo: vem do padrão do app', () => {
    expect(origemDoTipoDoProjeto('{}', '{}')).toBe('padrao');
    expect(origemDoTipoDoProjeto(undefined, undefined)).toBe('padrao');
  });

  it('modo inválido conta como ausente', () => {
    expect(origemDoTipoDoProjeto('{"modo_padrao":"amarelo"}', '{"modo_padrao":"full"}')).toBe(
      'global',
    );
  });
});

describe('fullFromSynthetic — uma conversão só', () => {
  const config = {
    crop_tela: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
    slot_tela: { x: 0, y: 0, w: 1, h: 1 },
  } as unknown as YoutubeSharedConfig;

  it('volta o config sintético de 1 tela ao shape {crop, slot}, em cópia', () => {
    const full = fullFromSynthetic(config);
    expect(full).toEqual({ crop: config.crop_tela, slot: config.slot_tela });
    expect(full.crop).not.toBe(config.crop_tela);
    expect(full.slot).not.toBe(config.slot_tela);
  });

  it('é a mesma conversão que o padrão do escopo grava em full', () => {
    const json = JSON.parse(padraoComPosicionamento('{}', 'full', config));
    expect(json.full).toEqual(fullFromSynthetic(config));
  });
});

describe('readPadraoModo saiu', () => {
  it('o módulo não oferece mais o leitor que tratava JSON sem modo como compartilhada', () => {
    expect('readPadraoModo' in padrao).toBe(false);
  });
});
