import { describe, expect, it } from 'vitest';
import { estaAprovado, statusAoAlternarVeredito } from '../statusDoCorte';

describe('estaAprovado (D-864)', () => {
  it.each([
    ['aprovado', true],
    ['processado', true],
    ['proposto', false],
    ['rejeitado', false],
  ] as const)('%s → %s', (status, esperado) => {
    expect(estaAprovado(status)).toBe(esperado);
  });

  // O clique (e o Enter) no veredito: num processado, desfaz a aprovação —
  // por isso o rótulo tem de dizer "Aprovado", não "Aprovar corte".
  it.each([
    ['proposto', 'aprovado'],
    ['rejeitado', 'aprovado'],
    ['aprovado', 'proposto'],
    ['processado', 'proposto'],
  ] as const)('alternar o veredito de %s dá %s', (status, esperado) => {
    expect(statusAoAlternarVeredito(status)).toBe(esperado);
  });
});
