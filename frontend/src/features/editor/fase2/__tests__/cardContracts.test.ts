import { describe, expect, it } from 'vitest';
import type { CenaRemotion } from '@/types/models';
import {
  aplicarLayoutCardPadrao,
  buildCenaVisualRevision,
  modeloCenaEfetivo,
} from '../cardPreviewContracts';

function comparativo(patch: Partial<CenaRemotion> = {}): CenaRemotion {
  return {
    tipo: 'comparativo_contraponto',
    inicio: 10,
    fim: 15,
    texto: 'HEGELIANISMO',
    subtexto: 'DE CABECA PARA BAIXO',
    rotuloA: 'HERANCA',
    rotuloB: 'INVERSAO',
    ...patch,
  };
}

describe('card contracts', () => {
  it('preserva modelo_cena=card ao aplicar layout padrao no preview', () => {
    const cena = comparativo({ modelo_cena: 'card' });

    const renderCena = aplicarLayoutCardPadrao(cena, 'vertical');

    expect(renderCena.modelo_cena).toBe('card');
    expect(renderCena.layout_card).toBe('vertical');
  });

  it('preserva layout explicito da cena acima do default global', () => {
    const cena = comparativo({ modelo_cena: 'card', layout_card: 'horizontal' });

    const renderCena = aplicarLayoutCardPadrao(cena, 'vertical');

    expect(renderCena.modelo_cena).toBe('card');
    expect(renderCena.layout_card).toBe('horizontal');
  });

  it('mudar modelo visual altera a revisao do Player', () => {
    const padrao = buildCenaVisualRevision([comparativo({ modelo_cena: 'padrao' })]);
    const card = buildCenaVisualRevision([comparativo({ modelo_cena: 'card' })]);

    expect(card).not.toBe(padrao);
  });

  it('mudar layout do card altera a revisao do Player', () => {
    const vertical = buildCenaVisualRevision([
      comparativo({ layout_card: 'vertical', modelo_cena: 'card' }),
    ]);
    const horizontal = buildCenaVisualRevision([
      comparativo({ layout_card: 'horizontal', modelo_cena: 'card' }),
    ]);

    expect(horizontal).not.toBe(vertical);
  });

  it('tipo legado comparativo_enfase tambem preserva modelo card', () => {
    const cena = comparativo({ tipo: 'comparativo_enfase', modelo_cena: 'card' });

    const renderCena = aplicarLayoutCardPadrao(cena, 'vertical');

    expect(renderCena.tipo).toBe('comparativo_enfase');
    expect(renderCena.modelo_cena).toBe('card');
    expect(renderCena.layout_card).toBe('vertical');
  });

  it('tela_cheia sempre vira card no modelo efetivo (I-031)', () => {
    const fullscreen: CenaRemotion = {
      tipo: 'tela_cheia',
      inicio: 0,
      fim: 5,
      texto: 'Pensar a totalidade',
    };

    expect(modeloCenaEfetivo(fullscreen)).toBe('card');
    expect(modeloCenaEfetivo({ ...fullscreen, modelo_cena: 'auto' })).toBe('card');
    expect(modeloCenaEfetivo({ ...fullscreen, modelo_cena: 'padrao' })).toBe('card');
    expect(buildCenaVisualRevision([fullscreen])).toContain('card');
  });

  it('tela_cheia longa tambem vira card (I-031)', () => {
    const fullscreen: CenaRemotion = {
      tipo: 'tela_cheia',
      inicio: 0,
      fim: 5,
      texto: 'o especialista e um barbaro moderno',
      subtexto: 'CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.',
    };

    expect(modeloCenaEfetivo(fullscreen)).toBe('card');
    expect(modeloCenaEfetivo({ ...fullscreen, modelo_cena: 'padrao' })).toBe('card');
    expect(buildCenaVisualRevision([fullscreen])).toContain('card');
  });
});
