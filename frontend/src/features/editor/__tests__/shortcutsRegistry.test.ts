import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS_REGISTRY,
  assertNoShortcutConflicts,
  shortcutCombo,
  shortcutFromRegistry,
  shortcutsForScreen,
} from '../shortcutsRegistry';

describe('shortcutsRegistry', () => {
  it('nao tem conflitos entre telas co-existentes', () => {
    expect(() => assertNoShortcutConflicts()).not.toThrow();
  });

  it('todos os ids sao unicos', () => {
    const ids = SHORTCUTS_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('detecta conflito quando duas telas coexistentes usam o mesmo combo', () => {
    expect(() =>
      assertNoShortcutConflicts([
        { id: 'pos.save', screen: 'pos', key: 's', mod: 'any', description: 'a', group: 'global' },
        {
          id: 'pos.toggleSelectionLock',
          screen: 'pos-timeline',
          key: 's',
          mod: 'any',
          description: 'b',
          group: 'global',
        },
      ]),
    ).toThrow(/Conflito de atalhos/);
  });

  it('shortcutCombo gera identificador legivel para Ctrl+L e Space', () => {
    expect(shortcutCombo({ key: 'l', mod: 'ctrl' })).toBe('Ctrl+L');
    expect(shortcutCombo({ key: ' ' })).toBe('Space');
    expect(shortcutCombo({ key: 'r', mod: 'ctrl+alt' })).toBe('Ctrl+Alt+R');
  });

  it('shortcutFromRegistry injeta a action mantendo metadados', () => {
    let chamou = 0;
    const binding = shortcutFromRegistry('pos.save', () => {
      chamou += 1;
    });
    expect(binding.key).toBe('s');
    expect(binding.mod).toBe('any');
    binding.action();
    expect(chamou).toBe(1);
  });

  it('shortcutFromRegistry lanca para id nao registrado', () => {
    // @ts-expect-error testando comportamento defensivo
    expect(() => shortcutFromRegistry('nao.existe', () => undefined)).toThrow(/nao registrado/);
  });

  it('shortcutsForScreen inclui os atalhos globais', () => {
    const posShortcuts = shortcutsForScreen('pos');
    expect(posShortcuts.some((s) => s.id === 'player.togglePlay')).toBe(true);
    expect(posShortcuts.some((s) => s.id === 'pos.save')).toBe(true);
  });
});
