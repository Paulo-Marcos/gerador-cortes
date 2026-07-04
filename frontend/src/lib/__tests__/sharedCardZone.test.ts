/**
 * REGRESSAO I-036: cards fora do SOURCE_BY_TYPE de shared-card-zone.tsx
 * renderizam em tamanho cheio por cima das janelas do palco no layout
 * compartilhado. O card de citacao (citacao_autor) e a chamada final
 * (chamada_final) ficaram fora do mapa quando a zona foi criada.
 */
import { describe, expect, it } from 'vitest';
import {
  SOURCE_BY_TYPE,
  fitSharedCardZone,
  shouldUseSharedCardZone,
} from '@video-renderer/shared-card-zone';

const ZONE = { x: 48, y: 96, w: 524, h: 521 };

// Tipos com variante card vertical — todos DEVEM respeitar a zona.
const TIPOS_CARD_VERTICAL = [
  'tela_cheia',
  'card_informacao',
  'pergunta_transicao',
  'definicao_termo',
  'comparativo_contraponto',
  'enfase',
  'ficha_biografica',
  'marco_historico',
  'linha_tempo',
  'lista_enumerada',
  'barra_inferior',
  'fonte_referencia',
  'citacao_autor',
  'chamada_final',
] as const;

function cenaCompartilhada(tipo: string) {
  return {
    tipo,
    layout_card: 'vertical',
    modelo_cena: 'card',
    layout_youtube_modo: 'compartilhada',
    layout_card_zone: ZONE,
  } as Parameters<typeof shouldUseSharedCardZone>[0];
}

describe('shouldUseSharedCardZone', () => {
  it.each(TIPOS_CARD_VERTICAL)('%s entra na zona compartilhada', (tipo) => {
    expect(shouldUseSharedCardZone(cenaCompartilhada(tipo))).toBe(true);
  });

  it('fora do modo compartilhada nao usa a zona', () => {
    const cena = { ...cenaCompartilhada('citacao_autor'), layout_youtube_modo: undefined };
    expect(shouldUseSharedCardZone(cena)).toBe(false);
  });

  it('sem layout_card_zone nao usa a zona', () => {
    const cena = { ...cenaCompartilhada('citacao_autor'), layout_card_zone: undefined };
    expect(shouldUseSharedCardZone(cena)).toBe(false);
  });
});

describe('fitSharedCardZone', () => {
  it.each(TIPOS_CARD_VERTICAL)('%s cabe dentro da zona', (tipo) => {
    const cena = cenaCompartilhada(tipo);
    const fit = fitSharedCardZone(cena);
    const source = SOURCE_BY_TYPE[tipo as keyof typeof SOURCE_BY_TYPE];
    expect(fit).not.toBeNull();
    expect(source).toBeDefined();

    // O frame translada o canvas e escala a partir da origem: o card em
    // (source.x, source.y) aparece em fit.x + source.x * scale. Verifica
    // contencao na zona com 1px de tolerancia de arredondamento.
    const left = fit!.x + source!.x * fit!.scale;
    const top = fit!.y + source!.y * fit!.scale;
    const right = left + source!.w * fit!.scale;
    const bottom = top + source!.h * fit!.scale;

    expect(left).toBeGreaterThanOrEqual(ZONE.x - 1);
    expect(top).toBeGreaterThanOrEqual(ZONE.y - 1);
    expect(right).toBeLessThanOrEqual(ZONE.x + ZONE.w + 1);
    expect(bottom).toBeLessThanOrEqual(ZONE.y + ZONE.h + 1);
  });
});
