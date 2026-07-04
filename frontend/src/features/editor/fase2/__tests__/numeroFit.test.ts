/**
 * D-067: a cena `destaque_numerico` estourava o layout quando o número era
 * grande ("1.000.000", "45 anos") — corpo fixo em 360px. Agora o corpo é
 * derivado do comprimento do texto FINAL para caber no anel reticle.
 *
 * Estes testes blindam a regra pura `numeroFontSize`: números curtos mantêm o
 * corpo homologado; números longos encolhem até caber sem nunca furar o piso.
 */
import { describe, expect, it } from 'vitest';
import { numeroFontSize } from '@video-renderer/cenas-v2/_shared/numeroFit';

const BASE = 360;
const MIN = 96;
const MAX_WIDTH = 660;
const GLYPH_RATIO = 0.6;

/** Largura estimada pela mesma heurística do helper. */
function larguraEstimada(texto: string, size: number) {
  return [...texto].length * GLYPH_RATIO * size;
}

describe('numeroFontSize', () => {
  it('mantém o corpo base para números curtos', () => {
    expect(numeroFontSize('3')).toBe(BASE);
    expect(numeroFontSize('45')).toBe(BASE);
    expect(numeroFontSize('100')).toBe(BASE);
  });

  it('reduz o corpo para números grandes, cabendo na largura útil', () => {
    const size = numeroFontSize('1.000.000');
    expect(size).toBeLessThan(BASE);
    expect(larguraEstimada('1.000.000', size)).toBeLessThanOrEqual(MAX_WIDTH + 1);
  });

  it('reduz o corpo quando há sufixo textual ("45 anos")', () => {
    const size = numeroFontSize('45 anos');
    expect(size).toBeLessThan(BASE);
    expect(larguraEstimada('45 anos', size)).toBeLessThanOrEqual(MAX_WIDTH + 1);
  });

  it('é monotônico: quanto mais longo o texto, menor (ou igual) o corpo', () => {
    const curto = numeroFontSize('1.000');
    const medio = numeroFontSize('1.000.000');
    const longo = numeroFontSize('1.000.000.000');
    expect(curto).toBeGreaterThanOrEqual(medio);
    expect(medio).toBeGreaterThanOrEqual(longo);
  });

  it('nunca cai abaixo do piso, mesmo para valores absurdamente longos', () => {
    expect(numeroFontSize('1.000.000.000.000.000')).toBeGreaterThanOrEqual(MIN);
  });

  it('respeita opções customizadas de base, piso e largura', () => {
    expect(numeroFontSize('1', { baseSize: 200 })).toBe(200);
    expect(numeroFontSize('aaaaaaaaaaaaaaaaaaaa', { minSize: 50 })).toBeGreaterThanOrEqual(50);
    expect(numeroFontSize('12345', { maxWidth: 9999 })).toBe(BASE);
  });

  it('trata texto vazio sem quebrar (retorna o corpo base)', () => {
    expect(numeroFontSize('')).toBe(BASE);
  });
});
