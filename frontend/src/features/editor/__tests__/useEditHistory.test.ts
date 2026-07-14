import { describe, expect, it } from 'vitest';
import type { Corte } from '@/types/models';
import {
  HISTORY_LIMIT,
  historyInit,
  historyPush,
  historyRedo,
  historyUndo,
} from '../useEditHistory';

type Dirty = Partial<Corte>;

describe('histórico de edição (past/present/future)', () => {
  it('começa sem passado nem futuro', () => {
    const s = historyInit<Dirty>({});
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
    expect(s.present).toEqual({});
  });

  it('empilha o presente anterior ao registrar uma alteração', () => {
    let s = historyInit<Dirty>({});
    s = historyPush(s, { inicio_seg: 10 });
    s = historyPush(s, { inicio_seg: 10, fim_seg: 20 });

    expect(s.present).toEqual({ inicio_seg: 10, fim_seg: 20 });
    expect(s.past).toEqual([{}, { inicio_seg: 10 }]);
    expect(s.future).toHaveLength(0);
  });

  it('desfaz volta ao presente anterior e alimenta o futuro', () => {
    let s = historyInit<Dirty>({});
    s = historyPush(s, { inicio_seg: 10 });
    s = historyPush(s, { inicio_seg: 10, fim_seg: 20 });

    s = historyUndo(s);
    expect(s.present).toEqual({ inicio_seg: 10 });
    expect(s.future).toEqual([{ inicio_seg: 10, fim_seg: 20 }]);

    s = historyUndo(s);
    expect(s.present).toEqual({});
    expect(s.past).toHaveLength(0);
  });

  it('refaz reaplica o presente desfeito', () => {
    let s = historyInit<Dirty>({});
    s = historyPush(s, { inicio_seg: 10 });
    s = historyUndo(s);
    s = historyRedo(s);

    expect(s.present).toEqual({ inicio_seg: 10 });
    expect(s.future).toHaveLength(0);
    expect(s.past).toEqual([{}]);
  });

  it('uma alteração nova após desfazer limpa o caminho de refazer', () => {
    let s = historyInit<Dirty>({});
    s = historyPush(s, { inicio_seg: 10 });
    s = historyPush(s, { inicio_seg: 10, fim_seg: 20 });
    s = historyUndo(s); // present = { inicio_seg: 10 }, future tem 1

    s = historyPush(s, { inicio_seg: 10, fim_seg: 30 });
    expect(s.present).toEqual({ inicio_seg: 10, fim_seg: 30 });
    expect(s.future).toHaveLength(0);
  });

  it('desfazer/refazer sem histórico é no-op (mesma referência)', () => {
    const s = historyInit<Dirty>({ inicio_seg: 5 });
    expect(historyUndo(s)).toBe(s);
    expect(historyRedo(s)).toBe(s);
  });

  it('registrar o mesmo valor não polui o passado', () => {
    const s = historyInit<Dirty>({});
    const same = s.present;
    expect(historyPush(s, same)).toBe(s);
  });

  it('respeita o teto de snapshots descartando os mais antigos', () => {
    let s = historyInit<Dirty>({ inicio_seg: 0 });
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      s = historyPush(s, { inicio_seg: i });
    }
    expect(s.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(s.present).toEqual({ inicio_seg: HISTORY_LIMIT + 5 });
  });
});
