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

  // D-842: A alterna (aprova / devolve a proposto) e R exclui com confirmação.
  // O id `bruto.rejeitar` fica: é a chave do overlay gravado no navegador.
  it('descreve A como alternar e R como excluir com confirmação', () => {
    const descricao = (id: string) => SHORTCUTS_REGISTRY.find((s) => s.id === id)?.description;
    expect(descricao('bruto.aprovar')).toBe('Aprovar / devolver a proposto');
    expect(descricao('bruto.rejeitar')).toBe('Excluir corte (pede confirmação)');
  });

  // D-886: W abre o porquê da IA em toda tela de um corte, sem modificador.
  it('W é o porquê do corte, global e sem colidir com nada', () => {
    const spec = SHORTCUTS_REGISTRY.find((s) => s.id === 'corte.porQue');
    expect(spec).toMatchObject({ screen: 'global', key: 'w', group: 'global' });
    expect(spec?.mod).toBeUndefined();
    expect(shortcutsForScreen('bruto').some((s) => s.id === 'corte.porQue')).toBe(true);
    expect(shortcutsForScreen('pos').some((s) => s.id === 'corte.porQue')).toBe(true);
  });

  // D-886: os atalhos dos shorts saíram para atalhosDosShorts (teto de
  // tamanho) e continuam no registro, na tela deles.
  it('os atalhos dos shorts seguem no registro', () => {
    const ids = shortcutsForScreen('shorts').map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'shorts.seekBack5s',
        'shorts.seekFwd5s',
        'shorts.speedDown',
        'shorts.speedUp',
        'shorts.alternarVelocidade',
        'shorts.undo',
        'shorts.redo',
        'shorts.salvar',
      ]),
    );
  });
});
