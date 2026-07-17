import { describe, expect, it } from 'vitest';
import {
  EMPTY_TABS_STATE,
  activateTab,
  closeTab,
  isSameTab,
  isWorkbenchEtapa,
  openTab,
  parseStoredTabs,
  serializeTabs,
  type TabsState,
  type WorkbenchTab,
} from '../useWorkbenchTabs';

const tab = (projetoId: number, etapa: WorkbenchTab['etapa'], corteId?: number): WorkbenchTab =>
  corteId === undefined ? { projetoId, etapa } : { projetoId, etapa, corteId };

const state = (tabs: WorkbenchTab[], activeIndex: number): TabsState => ({ tabs, activeIndex });

describe('openTab', () => {
  it('adiciona a aba nova no final e a ativa', () => {
    const s1 = openTab(EMPTY_TABS_STATE, tab(263, 'workspace'));
    const s2 = openTab(s1, tab(265, 'cortes', 12));
    expect(s2.tabs).toEqual([tab(263, 'workspace'), tab(265, 'cortes', 12)]);
    expect(s2.activeIndex).toBe(1);
  });

  it('foca a aba existente do mesmo projeto+etapa em vez de duplicar', () => {
    const s1 = openTab(openTab(EMPTY_TABS_STATE, tab(263, 'workspace')), tab(265, 'cortes'));
    const s2 = openTab(s1, tab(263, 'workspace'));
    expect(s2.tabs).toHaveLength(2);
    expect(s2.activeIndex).toBe(0);
  });

  it('atualiza o corteId ao focar a aba existente', () => {
    const s1 = openTab(EMPTY_TABS_STATE, tab(265, 'cortes', 12));
    const s2 = openTab(s1, tab(265, 'cortes', 34));
    expect(s2.tabs).toEqual([tab(265, 'cortes', 34)]);
    expect(s2.activeIndex).toBe(0);
  });

  it('preserva o corteId anterior quando o novo open não informa corte', () => {
    const s1 = openTab(EMPTY_TABS_STATE, tab(265, 'cortes', 12));
    const s2 = openTab(s1, tab(265, 'cortes'));
    expect(s2.tabs).toEqual([tab(265, 'cortes', 12)]);
  });

  it('mesmo projeto em etapas diferentes são abas distintas', () => {
    const s1 = openTab(openTab(EMPTY_TABS_STATE, tab(263, 'cortes')), tab(263, 'metadados'));
    expect(s1.tabs).toHaveLength(2);
  });
});

describe('closeTab', () => {
  const three = state([tab(1, 'workspace'), tab(2, 'cortes'), tab(3, 'pos')], 1);

  it('fechar a ativa ativa a vizinha à esquerda', () => {
    const s = closeTab(three, 1);
    expect(s.tabs).toEqual([tab(1, 'workspace'), tab(3, 'pos')]);
    expect(s.activeIndex).toBe(0);
  });

  it('fechar a primeira quando ela é a ativa mantém a primeira restante ativa', () => {
    const s = closeTab(state(three.tabs, 0), 0);
    expect(s.activeIndex).toBe(0);
    expect(s.tabs[0]).toEqual(tab(2, 'cortes'));
  });

  it('fechar aba antes da ativa desloca o índice ativo', () => {
    const s = closeTab(state(three.tabs, 2), 0);
    expect(s.activeIndex).toBe(1);
    expect(s.tabs[s.activeIndex]).toEqual(tab(3, 'pos'));
  });

  it('fechar aba depois da ativa mantém a ativa', () => {
    const s = closeTab(state(three.tabs, 0), 2);
    expect(s.activeIndex).toBe(0);
    expect(s.tabs[s.activeIndex]).toEqual(tab(1, 'workspace'));
  });

  it('fechar a última aba volta ao estado vazio', () => {
    const s = closeTab(state([tab(1, 'workspace')], 0), 0);
    expect(s).toEqual(EMPTY_TABS_STATE);
  });

  it('índice fora do intervalo não altera o estado', () => {
    expect(closeTab(three, -1)).toBe(three);
    expect(closeTab(three, 3)).toBe(three);
  });
});

describe('activateTab', () => {
  const two = state([tab(1, 'workspace'), tab(2, 'cortes')], 0);

  it('ativa o índice pedido', () => {
    expect(activateTab(two, 1).activeIndex).toBe(1);
  });

  it('índice inválido não altera o estado', () => {
    expect(activateTab(two, 5)).toBe(two);
    expect(activateTab(two, -1)).toBe(two);
  });
});

describe('persistência workbench-tabs-v1', () => {
  it('serializa e restaura o estado (round-trip)', () => {
    const s = state([tab(263, 'workspace'), tab(265, 'cortes', 12)], 1);
    expect(parseStoredTabs(serializeTabs(s))).toEqual(s);
  });

  it('rejeita null, JSON inválido e formatos errados', () => {
    expect(parseStoredTabs(null)).toBeNull();
    expect(parseStoredTabs('')).toBeNull();
    expect(parseStoredTabs('{nope')).toBeNull();
    expect(parseStoredTabs('{"tabs":"x"}')).toBeNull();
  });

  it('descarta abas malformadas mantendo as válidas e normaliza o activeIndex', () => {
    const raw = JSON.stringify({
      tabs: [
        { projetoId: 263, etapa: 'workspace' },
        { projetoId: 'x', etapa: 'cortes' },
        { projetoId: 265, etapa: 'inexistente' },
      ],
      activeIndex: 2,
    });
    const parsed = parseStoredTabs(raw);
    expect(parsed?.tabs).toEqual([tab(263, 'workspace')]);
    expect(parsed?.activeIndex).toBe(0);
  });

  it('lista persistida vazia vira estado vazio (activeIndex -1)', () => {
    expect(parseStoredTabs('{"tabs":[],"activeIndex":0}')).toEqual(EMPTY_TABS_STATE);
  });
});

describe('helpers', () => {
  it('isSameTab compara projeto+etapa ignorando corteId', () => {
    expect(isSameTab(tab(1, 'cortes', 5), tab(1, 'cortes', 9))).toBe(true);
    expect(isSameTab(tab(1, 'cortes'), tab(1, 'pos'))).toBe(false);
    expect(isSameTab(tab(1, 'cortes'), tab(2, 'cortes'))).toBe(false);
  });

  it('isWorkbenchEtapa aceita as 5 etapas e rejeita o resto', () => {
    for (const etapa of ['workspace', 'cortes', 'pos', 'metadados', 'revisao']) {
      expect(isWorkbenchEtapa(etapa)).toBe(true);
    }
    expect(isWorkbenchEtapa('export')).toBe(false);
    expect(isWorkbenchEtapa(null)).toBe(false);
  });
});
