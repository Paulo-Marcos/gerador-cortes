import { describe, expect, it } from 'vitest';
import {
  applyCoverEmojis,
  applyReadingTitlePrefix,
  buildReadingPatch,
  getReadingClickIntent,
  normalizeReadingPart,
  removeReadingTitlePrefix,
} from '../readingMetadata';

describe('readingMetadata', () => {
  it('applies the reading title prefix with author and part', () => {
    expect(applyReadingTitlePrefix('A ética da liberdade', 'Spinozza', 1)).toBe(
      'Leitura - Spinozza - PT.1 | A ética da liberdade',
    );
  });

  it('replaces an existing reading prefix', () => {
    expect(applyReadingTitlePrefix('Leitura - Marx - PT.2 | A crítica', 'Spinozza', 3)).toBe(
      'Leitura - Spinozza - PT.3 | A crítica',
    );
  });

  it('removes the old reading prefix format', () => {
    expect(removeReadingTitlePrefix('Leitura | Marx - A crítica')).toBe('A crítica');
  });

  it('accumulates fire and book emojis without duplication', () => {
    expect(applyCoverEmojis('🔥 📖 REALIDADE', true, true)).toBe('🔥 📖 REALIDADE');
  });

  it('normalizes invalid reading parts', () => {
    expect(normalizeReadingPart('0')).toBe(1);
    expect(normalizeReadingPart('4')).toBe(4);
  });
});

describe('reading toggle click intent', () => {
  it('abre o modal ao marcar leitura pela primeira vez', () => {
    expect(getReadingClickIntent(false, false)).toBe('toggle-on-and-open');
  });

  it('aguarda o segundo clique antes de editar uma leitura ja marcada', () => {
    expect(getReadingClickIntent(true, false)).toBe('wait-for-second-click');
  });

  it('abre o editor quando o segundo clique chega dentro da janela de duplo clique', () => {
    expect(getReadingClickIntent(true, true)).toBe('open-editor');
  });

  it('salva autor limpo e parte normalizada', () => {
    expect(buildReadingPatch('  Spinozza  ', '3')).toEqual({
      autor_leitura: 'Spinozza',
      parte_leitura: 3,
    });
  });
});
