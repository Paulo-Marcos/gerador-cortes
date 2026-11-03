import { describe, expect, it } from 'vitest';
import { rotuloDoNumero } from '@video-renderer/public-api';

// D-1018: "Dado" era o rótulo de todo número, e 10 de 19 cards medidos eram hipótese.

describe('o rótulo do card de número (D-1018)', () => {
  it('sem fonte, o número não se diz dado', () => {
    expect(rotuloDoNumero({})).toBeUndefined();
    expect(rotuloDoNumero({ fonte: '' })).toBeUndefined();
  });

  it('com fonte, o rótulo aparece', () => {
    expect(rotuloDoNumero({ fonte: 'IBGE' })).toBe('Dado');
  });

  it('o rótulo escrito na cena vence', () => {
    expect(rotuloDoNumero({ subtexto: 'Exemplo' })).toBe('Exemplo');
    expect(rotuloDoNumero({ subtexto: 'Exemplo', fonte: 'IBGE' })).toBe('Exemplo');
  });
});
