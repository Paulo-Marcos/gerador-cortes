import { describe, expect, it } from 'vitest';
import {
  HOME_TAB,
  INITIAL_TABS_STATE,
  activateTab,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  isHomeTab,
  isSameTab,
  isWorkbenchEtapa,
  moveTab,
  openTab,
  parseStoredTabs,
  pruneTabs,
  serializeTabs,
  tabKey,
  type GlobalTab,
  type ProjetoTab,
  type TabsState,
  type WorkbenchEtapa,
  type WorkbenchTab,
} from '../useWorkbenchTabs';

const aba = (projetoId: string, etapa: WorkbenchEtapa, corteId?: string): ProjetoTab =>
  corteId === undefined
    ? { kind: 'projeto', projetoId, etapa }
    : { kind: 'projeto', projetoId, etapa, corteId };

const global = (id: GlobalTab['global']): GlobalTab => ({ kind: 'global', global: id });

const state = (tabs: WorkbenchTab[], activeIndex: number): TabsState => ({ tabs, activeIndex });

describe('identidade da aba (D-427)', () => {
  it('projeto+corte identifica a aba; a etapa não entra na identidade', () => {
    expect(isSameTab(aba('1', 'cortes', 'c5'), aba('1', 'pos', 'c5'))).toBe(true);
    expect(isSameTab(aba('1', 'cortes', 'c5'), aba('1', 'cortes', 'c9'))).toBe(false);
    expect(isSameTab(aba('1', 'cortes'), aba('2', 'cortes'))).toBe(false);
    expect(isSameTab(aba('1', 'cortes'), aba('1', 'cortes', 'c5'))).toBe(false);
  });

  it('abas globais são identificadas pela tela', () => {
    expect(isSameTab(global('ranking'), global('ranking'))).toBe(true);
    expect(isSameTab(global('ranking'), global('analises'))).toBe(false);
    expect(tabKey(global('config'))).toBe('g:config');
  });

  it('a Biblioteca é a guia home', () => {
    expect(isHomeTab(HOME_TAB)).toBe(true);
    expect(isHomeTab(global('ranking'))).toBe(false);
    expect(INITIAL_TABS_STATE).toEqual({ tabs: [HOME_TAB], activeIndex: 0 });
  });
});

describe('openTab', () => {
  it('trocar de etapa continua na MESMA guia, levando o corte junto', () => {
    const s1 = openTab(INITIAL_TABS_STATE, aba('265', 'cortes', 'c12'));
    const s2 = openTab(s1, aba('265', 'pos', 'c12'));
    expect(s2.tabs).toHaveLength(2);
    expect(s2.tabs[1]).toEqual(aba('265', 'pos', 'c12'));
    expect(s2.activeIndex).toBe(1);
  });

  it('reabrir o mesmo corte foca a guia existente em vez de duplicar', () => {
    const s1 = openTab(INITIAL_TABS_STATE, aba('265', 'cortes', 'c12'));
    const s2 = openTab(s1, aba('263', 'cortes', 'c1'));
    const s3 = openTab(s2, aba('265', 'cortes', 'c12'));
    expect(s3.tabs).toHaveLength(3);
    expect(s3.activeIndex).toBe(1);
  });

  it('abrir um corte diferente abre outra guia', () => {
    const s1 = openTab(INITIAL_TABS_STATE, aba('265', 'cortes', 'c12'));
    const s2 = openTab(s1, aba('265', 'cortes', 'c34'));
    expect(s2.tabs).toEqual([HOME_TAB, aba('265', 'cortes', 'c12'), aba('265', 'cortes', 'c34')]);
    expect(s2.activeIndex).toBe(2);
  });

  it('a aba do projeto ainda sem corte ADOTA o primeiro corte aberto a partir dela', () => {
    const s1 = openTab(INITIAL_TABS_STATE, aba('265', 'workspace'));
    const s2 = openTab(s1, aba('265', 'cortes', 'c12'));
    expect(s2.tabs).toEqual([HOME_TAB, aba('265', 'cortes', 'c12')]);
    expect(s2.activeIndex).toBe(1);
  });

  it('rota sem corte não cria guia nova quando já existe uma do projeto', () => {
    const s1 = openTab(INITIAL_TABS_STATE, aba('265', 'cortes', 'c12'));
    const s2 = openTab(s1, aba('265', 'metadados'));
    expect(s2.tabs).toEqual([HOME_TAB, aba('265', 'metadados', 'c12')]);
  });

  it('rota sem corte foca a aba do projeto mesmo quando outra está ativa', () => {
    const s1 = openTab(openTab(INITIAL_TABS_STATE, aba('265', 'cortes', 'c12')), global('ranking'));
    const s2 = openTab(s1, aba('265', 'workspace'));
    expect(s2.tabs).toHaveLength(3);
    expect(s2.activeIndex).toBe(1);
    expect(s2.tabs[1]).toEqual(aba('265', 'workspace', 'c12'));
  });

  it('tela global vira aba própria e reabri-la só foca', () => {
    const s1 = openTab(INITIAL_TABS_STATE, global('ranking'));
    const s2 = openTab(openTab(s1, aba('265', 'cortes', 'c1')), global('ranking'));
    expect(s2.tabs).toEqual([HOME_TAB, global('ranking'), aba('265', 'cortes', 'c1')]);
    expect(s2.activeIndex).toBe(1);
  });

  it('reabrir a aba ativa sem mudança devolve o mesmo estado', () => {
    const s1 = openTab(INITIAL_TABS_STATE, aba('265', 'pos', 'c1'));
    expect(openTab(s1, aba('265', 'pos', 'c1'))).toBe(s1);
  });
});

describe('closeTab', () => {
  const tres = state([HOME_TAB, aba('2', 'cortes', 'a'), aba('3', 'pos', 'b')], 1);

  it('fechar a ativa ativa a vizinha à esquerda', () => {
    const s = closeTab(tres, 1);
    expect(s.tabs).toEqual([HOME_TAB, aba('3', 'pos', 'b')]);
    expect(s.activeIndex).toBe(0);
  });

  it('fechar aba depois da ativa mantém a ativa', () => {
    const s = closeTab(tres, 2);
    expect(s.activeIndex).toBe(1);
    expect(s.tabs[s.activeIndex]).toEqual(aba('2', 'cortes', 'a'));
  });

  it('fechar aba antes da ativa desloca o índice ativo', () => {
    const s = closeTab(state(tres.tabs, 2), 1);
    expect(s.activeIndex).toBe(1);
    expect(s.tabs[s.activeIndex]).toEqual(aba('3', 'pos', 'b'));
  });

  it('a guia Biblioteca não fecha', () => {
    expect(closeTab(tres, 0)).toBe(tres);
  });

  it('índice fora do intervalo não altera o estado', () => {
    expect(closeTab(tres, -1)).toBe(tres);
    expect(closeTab(tres, 3)).toBe(tres);
  });
});

describe('fechar em lote', () => {
  const quatro = state(
    [HOME_TAB, global('ranking'), aba('2', 'cortes', 'a'), aba('3', 'pos', 'b')],
    3,
  );

  it('fechar as outras mantém a aba escolhida e a Biblioteca', () => {
    const s = closeOtherTabs(quatro, 2);
    expect(s.tabs).toEqual([HOME_TAB, aba('2', 'cortes', 'a')]);
    expect(s.activeIndex).toBe(1);
  });

  it('fechar à direita corta o resto da faixa', () => {
    const s = closeTabsToRight(quatro, 1);
    expect(s.tabs).toEqual([HOME_TAB, global('ranking')]);
    expect(s.activeIndex).toBe(1);
  });

  it('fechar à direita da última não altera o estado', () => {
    expect(closeTabsToRight(quatro, 3)).toBe(quatro);
  });

  it('fechar todas volta para a Biblioteca', () => {
    expect(closeAllTabs()).toEqual(INITIAL_TABS_STATE);
  });
});

describe('moveTab (reordenar arrastando)', () => {
  const tres = state([HOME_TAB, aba('2', 'cortes', 'a'), aba('3', 'pos', 'b')], 2);

  it('move a aba e segue a aba ativa', () => {
    const s = moveTab(tres, 2, 1);
    expect(s.tabs).toEqual([HOME_TAB, aba('3', 'pos', 'b'), aba('2', 'cortes', 'a')]);
    expect(s.activeIndex).toBe(1);
  });

  it('a Biblioteca fica presa na primeira posição', () => {
    expect(moveTab(tres, 0, 2)).toBe(tres);
    expect(moveTab(tres, 2, 0)).toBe(tres);
  });

  it('índices inválidos ou iguais não alteram o estado', () => {
    expect(moveTab(tres, 1, 1)).toBe(tres);
    expect(moveTab(tres, 1, 9)).toBe(tres);
  });
});

describe('activateTab', () => {
  const duas = state([HOME_TAB, aba('2', 'cortes', 'a')], 0);

  it('ativa o índice pedido', () => {
    expect(activateTab(duas, 1).activeIndex).toBe(1);
  });

  it('índice inválido não altera o estado', () => {
    expect(activateTab(duas, 5)).toBe(duas);
    expect(activateTab(duas, -1)).toBe(duas);
  });
});

describe('pruneTabs (abas fantasmas — D-394)', () => {
  const tres = state([HOME_TAB, aba('b', 'cortes', 'x'), aba('c', 'pos', 'y')], 1);

  it('remove abas de projetos inexistentes e preserva as globais', () => {
    const s = pruneTabs(tres, new Set(['c']));
    expect(s.tabs).toEqual([HOME_TAB, aba('c', 'pos', 'y')]);
  });

  it('mantém a ativa quando ela sobrevive', () => {
    const s = pruneTabs(tres, new Set(['b']));
    expect(s.tabs[s.activeIndex]).toEqual(aba('b', 'cortes', 'x'));
  });

  it('nenhuma fantasma → mesmo objeto', () => {
    expect(pruneTabs(tres, new Set(['b', 'c']))).toBe(tres);
  });
});

describe('persistência workbench-tabs-v2', () => {
  it('serializa e restaura o estado (round-trip)', () => {
    const s = state([HOME_TAB, global('atalhos'), aba('265', 'pos', 'c12')], 2);
    expect(parseStoredTabs(serializeTabs(s))).toEqual(s);
  });

  it('rejeita null, JSON inválido e formatos errados', () => {
    expect(parseStoredTabs(null)).toBeNull();
    expect(parseStoredTabs('')).toBeNull();
    expect(parseStoredTabs('{nope')).toBeNull();
    expect(parseStoredTabs('{"tabs":"x"}')).toBeNull();
  });

  it('descarta abas malformadas e garante a Biblioteca como primeira', () => {
    const raw = JSON.stringify({
      tabs: [
        { kind: 'projeto', projetoId: 'p263', etapa: 'workspace' },
        { kind: 'projeto', projetoId: 263, etapa: 'cortes' },
        { kind: 'global', global: 'inexistente' },
      ],
      activeIndex: 0,
    });
    const parsed = parseStoredTabs(raw);
    expect(parsed?.tabs).toEqual([HOME_TAB, aba('p263', 'workspace')]);
    expect(parsed?.tabs[parsed.activeIndex]).toEqual(aba('p263', 'workspace'));
  });

  it('migra o v1 colapsando as abas por etapa numa aba de trabalho só', () => {
    const v1 = JSON.stringify({
      tabs: [
        { projetoId: '265', etapa: 'cortes', corteId: 'c12' },
        { projetoId: '265', etapa: 'pos', corteId: 'c12' },
        { projetoId: '265', etapa: 'metadados' },
      ],
      activeIndex: 1,
    });
    const parsed = parseStoredTabs(v1);
    expect(parsed?.tabs).toEqual([HOME_TAB, aba('265', 'cortes', 'c12'), aba('265', 'metadados')]);
  });

  it('lista persistida vazia vira o estado inicial', () => {
    expect(parseStoredTabs('{"tabs":[],"activeIndex":0}')).toEqual(INITIAL_TABS_STATE);
  });
});

describe('helpers', () => {
  it('isWorkbenchEtapa aceita as 5 etapas e rejeita o resto', () => {
    for (const etapa of ['workspace', 'cortes', 'pos', 'metadados', 'revisao']) {
      expect(isWorkbenchEtapa(etapa)).toBe(true);
    }
    expect(isWorkbenchEtapa('export')).toBe(false);
    expect(isWorkbenchEtapa(null)).toBe(false);
  });
});
