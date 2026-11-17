import { describe, expect, it } from 'vitest';
import { aplicarTemaNoDocumento } from '../KitEstado';

function raizFalsa(inicial: string | null) {
  const attrs = new Map<string, string>();
  if (inicial !== null) attrs.set('data-theme', inicial);
  return {
    attrs,
    getAttribute: (n: string) => attrs.get(n) ?? null,
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    removeAttribute: (n: string) => void attrs.delete(n),
  };
}

describe('aplicarTemaNoDocumento', () => {
  it('põe o tema e, ao sair, devolve o que havia', () => {
    const raiz = raizFalsa('ardosia');
    const sair = aplicarTemaNoDocumento(raiz, 'light');
    expect(raiz.getAttribute('data-theme')).toBe('light');
    sair();
    expect(raiz.getAttribute('data-theme')).toBe('ardosia');
  });

  it('se não havia tema, ao sair o atributo some', () => {
    const raiz = raizFalsa(null);
    const sair = aplicarTemaNoDocumento(raiz, 'dark');
    expect(raiz.getAttribute('data-theme')).toBe('dark');
    sair();
    expect(raiz.attrs.has('data-theme')).toBe(false);
  });
});
