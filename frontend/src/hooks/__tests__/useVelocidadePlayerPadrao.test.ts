import { describe, expect, it } from 'vitest';
import { normalizarVelocidade } from '../useVelocidadePlayerPadrao';

// D-450: o valor chega da API e vai direto para `playbackRate`, que rejeita
// numeros fora de faixa. Esta e a ultima barreira antes do <video>.
describe('normalizarVelocidade', () => {
  it('mantem uma velocidade valida', () => {
    expect(normalizarVelocidade(1.5)).toBe(1.5);
  });

  it('cai em 1x quando o ajuste ainda nao chegou', () => {
    expect(normalizarVelocidade(undefined)).toBe(1);
    expect(normalizarVelocidade(null)).toBe(1);
  });

  it('cai em 1x para valores nao finitos', () => {
    expect(normalizarVelocidade(Number.NaN)).toBe(1);
    expect(normalizarVelocidade(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('clampa nos limites do player', () => {
    expect(normalizarVelocidade(9)).toBe(4);
    expect(normalizarVelocidade(0)).toBe(0.25);
  });
});
