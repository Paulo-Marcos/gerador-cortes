import { describe, expect, it } from 'vitest';
import { luzDoCanal, luzDoCanalDe } from '../luzDoCanal';

const paleta = { secundaria: '#7a2fd0', acento: '#e0457b' };
const luz = ['#1f9d8f', '#f0b43a'];

describe('luzDoCanalDe — o campo `luz` do backend é a fonte 2', () => {
  it('com `luz` preenchido e sem paleta, o anel usa essas cores', () => {
    expect(luzDoCanalDe({ paleta: { secundaria: '', acento: '' }, luz }, 'escuro')).toEqual(
      luzDoCanal({ amostra: { a: luz[0], b: luz[1] } }, 'escuro'),
    );
  });
  it('a paleta cadastrada vence o `luz`', () => {
    expect(luzDoCanalDe({ paleta, luz }, 'escuro')).toEqual(luzDoCanal({ paleta }, 'escuro'));
  });
  it('`luz` vazio e sem paleta: anel neutro (null)', () => {
    expect(luzDoCanalDe({ paleta: { secundaria: '', acento: '' }, luz: [] }, 'claro')).toBeNull();
    expect(luzDoCanalDe({ luz: undefined }, 'escuro')).toBeNull();
    expect(luzDoCanalDe(undefined, 'escuro')).toBeNull();
  });
});
