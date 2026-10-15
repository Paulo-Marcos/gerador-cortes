import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  RECT_KEYS_FULL,
  RECT_KEYS_ONE_SCREEN,
  RECT_KEYS_TWO_SCREENS,
  SlotPreview,
  comZonaManual,
  getRectLabel,
  semZonaManual,
} from '../posicionamentoControls';
import { DEFAULT_YOUTUBE_LAYOUT, type YoutubeSharedConfig } from '@/shared/palco/youtubeLayout';

// D-904: o operador diz onde os cards ficam. O modal ganha o retângulo
// "Cards"; no palco ele aparece tracejado enquanto é a regra automática e
// arrastável depois que o operador o fixou.

const MANUAL = { x: 1400, y: 200, w: 440, h: 600 };

function config(overrides: Partial<YoutubeSharedConfig> = {}): YoutubeSharedConfig {
  return { ...DEFAULT_YOUTUBE_LAYOUT.compartilhada, ...overrides };
}

function renderPreview(cfg: YoutubeSharedConfig, rectKey: 'zona_card' | 'slot_tela') {
  return renderToStaticMarkup(
    <SlotPreview
      config={cfg}
      rectKey={rectKey}
      currentTime={0}
      fundo="hud-forte"
      placa={{ nome: '', papel: '' }}
      onChangeSlot={vi.fn()}
    />,
  );
}

describe('o retângulo dos cards no modal de posicionamento', () => {
  it('é oferecido na compartilhada (1 ou 2 telas) e não no FULL', () => {
    expect(RECT_KEYS_TWO_SCREENS).toContain('zona_card');
    expect(RECT_KEYS_ONE_SCREEN).toContain('zona_card');
    expect(RECT_KEYS_FULL).not.toContain('zona_card');
    expect(getRectLabel('zona_card', 2)).toBe('Cards');
  });

  it('Manual fixa a zona onde a automática cai hoje; Automática apaga a chave', () => {
    const manual = comZonaManual(config());
    expect(manual.zona_card).toEqual({ x: 48, y: 96, w: 424, h: 281 });
    expect(semZonaManual(manual)).not.toHaveProperty('zona_card');
    expect(semZonaManual(manual)).toEqual(config());
  });
});

describe('o preview do palco', () => {
  it('mostra a zona automática tracejada quando Cards está selecionado', () => {
    const html = renderPreview(config(), 'zona_card');
    expect(html).toContain('Cards (automática)');
    expect(html).toContain('border-dashed');
    expect(html).toContain('424×281');
  });

  // D-928: a zona não some mais quando outro retângulo está selecionado — o
  // dono pediu para vê-la sempre ("o container dos cards ficou invisível").
  it('desenha a zona automática tracejada mesmo quando outro retângulo está selecionado', () => {
    const html = renderPreview(config(), 'slot_tela');
    expect(html).toContain('Cards (automática)');
    expect(html).toContain('border-dashed');
  });

  it('desenha a zona manual arrastável, mesmo sem estar selecionada', () => {
    const html = renderPreview(config({ zona_card: MANUAL }), 'slot_tela');
    expect(html).toContain('cursor-grab');
    expect(html).toContain(`left:${(1400 / 1920) * 100}%`);
    const selecionado = renderPreview(config({ zona_card: MANUAL }), 'zona_card');
    expect(selecionado).toContain('Cards 440×600');
    expect(selecionado).not.toContain('automática');
  });
});
