import { describe, expect, it } from 'vitest';
import { isValidPaletteId, PALETTES } from '../usePalette';

describe('isValidPaletteId', () => {
  it('aceita as 5 ids do design (terracota + 4 alternativas)', () => {
    expect(isValidPaletteId('terracota')).toBe(true);
    expect(isValidPaletteId('indigo')).toBe(true);
    expect(isValidPaletteId('forest')).toBe(true);
    expect(isValidPaletteId('plum')).toBe(true);
    expect(isValidPaletteId('ink')).toBe(true);
  });

  it('rejeita id desconhecido', () => {
    expect(isValidPaletteId('amarelo')).toBe(false);
    expect(isValidPaletteId('')).toBe(false);
  });

  it('rejeita valores não-string', () => {
    expect(isValidPaletteId(null)).toBe(false);
    expect(isValidPaletteId(undefined)).toBe(false);
    expect(isValidPaletteId(42)).toBe(false);
    expect(isValidPaletteId({ id: 'indigo' })).toBe(false);
  });
});

describe('PALETTES catalog', () => {
  it('lista exatamente as 5 paletas do design (terracota default + 4 alternativas)', () => {
    const ids = PALETTES.map((p) => p.id).sort();
    expect(ids).toEqual(['forest', 'indigo', 'ink', 'plum', 'terracota']);
  });

  it('terracota é a primeira (default visual no seletor)', () => {
    expect(PALETTES[0].id).toBe('terracota');
  });

  it('todas as paletas têm nome, descricao e swatch oklch', () => {
    for (const p of PALETTES) {
      expect(p.nome.length).toBeGreaterThan(0);
      expect(p.descricao.length).toBeGreaterThan(0);
      expect(p.swatch).toMatch(/^oklch\(/);
    }
  });
});
