import { describe, expect, it } from 'vitest';
import { luzDoCanal, travarLuminosidade } from '../luzDoCanal';

// D-1127 (E-069 H-11c): a ordem das três fontes da luz e a luminosidade travada por tema.
const luminosidade = (css: string | null) => Number(/oklch\(([\d.]+)/.exec(css ?? '')?.[1]);

describe('luzDoCanal — a ordem das fontes', () => {
  const paleta = { secundaria: '#7a2fd0', acento: '#e0457b' };
  const amostra = { a: '#1f9d8f', b: '#f0b43a' };

  it('(1) a paleta cadastrada vence a amostra das capas', () => {
    const luz = luzDoCanal({ paleta, amostra }, 'escuro');
    expect(luz).toEqual(luzDoCanal({ paleta }, 'escuro'));
    expect(luz).not.toEqual(luzDoCanal({ amostra }, 'escuro'));
  });

  it('(2) paleta vazia (como na PROD) cai para a amostra', () => {
    const vazia = { secundaria: '', acento: '' };
    expect(luzDoCanal({ paleta: vazia, amostra }, 'escuro')).toEqual(luzDoCanal({ amostra }, 'escuro'));
    expect(luzDoCanal({ paleta: vazia, amostra }, 'escuro')).not.toBeNull();
  });

  it('(3) sem paleta nem amostra o anel é neutro (null)', () => {
    expect(luzDoCanal({}, 'escuro')).toBeNull();
    expect(luzDoCanal({ paleta: { secundaria: '', acento: '' }, amostra: null }, 'claro')).toBeNull();
  });

  it('cor inválida na paleta não derruba: segue para a próxima fonte', () => {
    expect(luzDoCanal({ paleta: { secundaria: 'verde', acento: 'x' }, amostra }, 'escuro')).not.toBeNull();
  });

  it('uma cor só vale pelas duas', () => {
    const luz = luzDoCanal({ paleta: { secundaria: '', acento: '#e0457b' } }, 'escuro');
    expect(luz?.a).toBe(luz?.b);
  });
});

describe('luzDoCanal — luminosidade OKLCH travada', () => {
  const CORES = ['#000000', '#101010', '#7a2fd0', '#e0457b', '#1f9d8f', '#f0b43a', '#ffffff', '#fff', '#b9f24a'];

  it.each(CORES)('%s fica ≥ 0,78 no escuro', (hex) => {
    expect(luminosidade(travarLuminosidade(hex, 'escuro'))).toBeGreaterThanOrEqual(0.78);
  });

  it.each(CORES)('%s fica ≤ 0,62 no claro', (hex) => {
    expect(luminosidade(travarLuminosidade(hex, 'claro'))).toBeLessThanOrEqual(0.62);
  });

  it('não escurece o que já passa no escuro nem clareia o que já passa no claro', () => {
    expect(luminosidade(travarLuminosidade('#ffffff', 'escuro'))).toBeCloseTo(1, 2);
    expect(luminosidade(travarLuminosidade('#000000', 'claro'))).toBeCloseTo(0, 2);
  });

  it('mantém o matiz: o roxo continua roxo', () => {
    const h = Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(travarLuminosidade('#7a2fd0', 'escuro') ?? '')?.[1]);
    expect(h).toBeGreaterThan(280);
    expect(h).toBeLessThan(330);
  });

  it('hex inválido devolve null', () => {
    expect(travarLuminosidade('#12', 'escuro')).toBeNull();
  });
});
