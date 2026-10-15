/**
 * D-931: o card de número em destaque (destaque_numerico) ficava fora do
 * SOURCE_BY_TYPE e, na tela compartilhada, saía por cima da tela pequena em vez
 * de ir para a zona dos cards — a mesma regressão da I-036, num tipo novo.
 */
import { describe, expect, it } from 'vitest';
import { SOURCE_BY_TYPE, fitSharedCardZone, shouldUseSharedCardZone } from '@video-renderer/shared-card-zone';
import { TIPOS_COM_EXEMPLO } from '@/features/editor/fase2/ExemploDoCard';

const ZONA = { x: 1300, y: 120, w: 540, h: 820 };

const naZona = (tipo: string) =>
  ({
    tipo,
    layout_card: 'vertical',
    modelo_cena: 'card',
    layout_youtube_modo: 'compartilhada',
    layout_card_zone: ZONA,
  }) as Parameters<typeof shouldUseSharedCardZone>[0];

describe('número em destaque na zona dos cards (D-931)', () => {
  it('entra na zona compartilhada', () => {
    expect(shouldUseSharedCardZone(naZona('destaque_numerico'))).toBe(true);
  });

  it('cabe inteiro dentro da zona', () => {
    const fit = fitSharedCardZone(naZona('destaque_numerico'))!;
    const fonte = SOURCE_BY_TYPE.destaque_numerico!;
    const esquerda = fit.x + fonte.x * fit.scale;
    const topo = fit.y + fonte.y * fit.scale;
    expect(esquerda).toBeGreaterThanOrEqual(ZONA.x - 1);
    expect(topo).toBeGreaterThanOrEqual(ZONA.y - 1);
    expect(esquerda + fonte.w * fit.scale).toBeLessThanOrEqual(ZONA.x + ZONA.w + 1);
    expect(topo + fonte.h * fit.scale).toBeLessThanOrEqual(ZONA.y + ZONA.h + 1);
  });

  it('nenhum tipo de card fica de fora da zona', () => {
    const fora = TIPOS_COM_EXEMPLO.filter((tipo) => !shouldUseSharedCardZone(naZona(tipo)));
    expect(fora).toEqual([]);
  });
});
