import { describe, expect, it } from 'vitest';
import { estaAprovado } from '../statusDoCorte';

describe('estaAprovado (D-864)', () => {
  it.each([
    ['aprovado', true],
    ['processado', true],
    ['proposto', false],
    ['rejeitado', false],
  ] as const)('%s → %s', (status, esperado) => {
    expect(estaAprovado(status)).toBe(esperado);
  });
});
