import { describe, expect, it } from 'vitest';
import { providerDoModelo, providerEmVoo } from '../providerIa';

describe('providerEmVoo', () => {
  it('diz qual provider está gerando, para só um botão girar', () => {
    expect(providerEmVoo({ isPending: true, variables: 'gemini' })).toBe('gemini');
    expect(providerEmVoo({ isPending: true, variables: 'claude' })).toBe('claude');
  });

  it('sem nada em voo, nenhum botão gira', () => {
    expect(providerEmVoo({ isPending: false, variables: 'gemini' })).toBeNull();
  });

  it('chamada antiga sem variables conta como Claude, que era o único caminho', () => {
    expect(providerEmVoo({ isPending: true })).toBe('claude');
  });
});

describe('providerDoModelo', () => {
  it('reconhece o Gemini pelo nome do modelo', () => {
    expect(providerDoModelo('gemini-3.1-pro-high')).toBe('gemini');
  });

  it('trata o resto como Claude', () => {
    expect(providerDoModelo('opus')).toBe('claude');
    expect(providerDoModelo('claude-sonnet-5')).toBe('claude');
  });

  it('sem modelo não afirma provider: melhor sem selo que com selo errado', () => {
    expect(providerDoModelo('')).toBeNull();
    expect(providerDoModelo(null)).toBeNull();
    expect(providerDoModelo(undefined)).toBeNull();
  });
});
