import { describe, expect, it } from 'vitest';
import {
  EMPTY_PINS,
  parseStoredPins,
  prunePins,
  serializePins,
  togglePin,
} from '../useProjetosFixados';

describe('togglePin', () => {
  it('fixa o projeto no fim da lista', () => {
    expect(togglePin(EMPTY_PINS, '263')).toEqual(['263']);
    expect(togglePin(['263'], '265')).toEqual(['263', '265']);
  });

  it('solta o projeto já fixado', () => {
    expect(togglePin(['263', '265'], '263')).toEqual(['265']);
  });

  it('não duplica ao fixar o mesmo projeto duas vezes', () => {
    const uma = togglePin(EMPTY_PINS, '263');
    expect(togglePin(togglePin(uma, '263'), '263')).toEqual(['263']);
  });
});

describe('prunePins', () => {
  it('solta pins de projetos que não existem mais', () => {
    expect(prunePins(['263', 'sumiu', '265'], new Set(['263', '265']))).toEqual(['263', '265']);
  });

  it('devolve o mesmo array quando todos os pins são válidos', () => {
    const fixados = ['263', '265'];
    expect(prunePins(fixados, new Set(['263', '265', '999']))).toBe(fixados);
  });
});

describe('parseStoredPins', () => {
  it('faz round-trip com serializePins', () => {
    expect(parseStoredPins(serializePins(['263', '265']))).toEqual(['263', '265']);
  });

  it('devolve null para vazio ou JSON inválido', () => {
    expect(parseStoredPins(null)).toBeNull();
    expect(parseStoredPins('')).toBeNull();
    expect(parseStoredPins('{')).toBeNull();
    expect(parseStoredPins('{"fixados":[]}')).toBeNull();
  });

  it('descarta entradas malformadas e duplicadas', () => {
    expect(parseStoredPins('["263", 7, "", null, "265", "263"]')).toEqual(['263', '265']);
  });
});
