import { describe, expect, it } from 'vitest';
import {
  AUTO_COLLAPSE_ORDER,
  CENTER_MIN_PX,
  DEFAULT_OPEN_STATE,
  PANEL_WIDTHS,
  isWorkbenchPanelId,
  parseStoredPanels,
  resolveEffectiveOpen,
  serializePanels,
  type WorkbenchPanelId,
} from '../useWorkbenchPanels';

/** Painéis da view do editor bruto (DE-PARA §0/§3). */
const EDITOR_PANELS: WorkbenchPanelId[] = ['rail', 'cuts', 'right', 'fila'];
/** Painéis da view de pós-produção (DE-PARA §0/§4). */
const POS_PANELS: WorkbenchPanelId[] = ['rail', 'cenas', 'layout', 'fila'];

const allOpen = () => ({ ...DEFAULT_OPEN_STATE });

describe('constantes do hand-off', () => {
  it('dimensões abertas/colapsadas batem com o README do hand-off', () => {
    expect(PANEL_WIDTHS.rail).toEqual({ open: 216, collapsed: 62 });
    expect(PANEL_WIDTHS.cuts).toEqual({ open: 236, collapsed: 40 });
    expect(PANEL_WIDTHS.right).toEqual({ open: 300, collapsed: 38 });
    expect(PANEL_WIDTHS.fila).toEqual({ open: 248, collapsed: 42 });
    expect(PANEL_WIDTHS.cenas).toEqual({ open: 232, collapsed: 40 });
    expect(PANEL_WIDTHS.layout).toEqual({ open: 260, collapsed: 38 });
  });

  it('centro mínimo é 420px e a ordem de cedência é rail→fila→dir→esq', () => {
    expect(CENTER_MIN_PX).toBe(420);
    expect(AUTO_COLLAPSE_ORDER).toEqual(['rail', 'fila', 'right', 'layout', 'cuts', 'cenas']);
  });
});

describe('resolveEffectiveOpen — auto-colapso responsivo', () => {
  it('viewport larga: nenhum painel colapsa', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 1920,
    });
    expect(effective).toEqual(allOpen());
  });

  it('editor em 1440px cabe inteiro (216+236+300+248+420 = 1420)', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 1440,
    });
    for (const id of EDITOR_PANELS) expect(effective[id]).toBe(true);
  });

  it('primeiro a ceder é o rail', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 1380,
    });
    expect(effective.rail).toBe(false);
    expect(effective.cuts).toBe(true);
    expect(effective.right).toBe(true);
    expect(effective.fila).toBe(true);
  });

  it('em 1024px cedem rail, fila e right — cuts (esquerda) permanece', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 1024,
    });
    expect(effective.rail).toBe(false);
    expect(effective.fila).toBe(false);
    expect(effective.right).toBe(false);
    expect(effective.cuts).toBe(true);
  });

  it('em 768px o cuts também cede', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 768,
    });
    expect(effective.rail).toBe(false);
    expect(effective.fila).toBe(false);
    expect(effective.right).toBe(false);
    expect(effective.cuts).toBe(false);
  });

  it('painéis já colapsados pelo usuário contam com a largura colapsada', () => {
    const desired = { ...allOpen(), rail: false, fila: false };
    // 62+236+300+42 = 640; 640+420 = 1060 ≤ 1100 → nada mais colapsa
    const effective = resolveEffectiveOpen({
      desired,
      active: EDITOR_PANELS,
      viewportWidth: 1100,
    });
    expect(effective.cuts).toBe(true);
    expect(effective.right).toBe(true);
  });

  it('na pós-produção a ordem vale para cenas/layout (rail→fila→layout→cenas)', () => {
    // 216+232+260+248 = 956; em 1200px: 956+420 > 1200 → rail cede (802+420=1222>1200)
    // → fila cede (596+420=1016 ≤ 1200) → para.
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: POS_PANELS,
      viewportWidth: 1200,
    });
    expect(effective.rail).toBe(false);
    expect(effective.fila).toBe(false);
    expect(effective.layout).toBe(true);
    expect(effective.cenas).toBe(true);
  });

  it('painel expandido manualmente por último vence: os outros cedem no lugar dele', () => {
    // Sem manual, em 1024px o right cederia; com right manual, quem cede é o cuts.
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 1024,
      lastManualExpand: 'right',
    });
    expect(effective.right).toBe(true);
    expect(effective.cuts).toBe(false);
    expect(effective.rail).toBe(false);
    expect(effective.fila).toBe(false);
  });

  it('o manual só cede em último caso (viewport menor que qualquer combinação)', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 600,
      lastManualExpand: 'right',
    });
    expect(effective.right).toBe(false);
  });

  it('não altera o desejado de painéis fora da view ativa', () => {
    const effective = resolveEffectiveOpen({
      desired: allOpen(),
      active: EDITOR_PANELS,
      viewportWidth: 320,
    });
    expect(effective.cenas).toBe(true);
    expect(effective.layout).toBe(true);
  });
});

describe('persistência workbench-panels-v1', () => {
  it('serializa e restaura o estado (round-trip)', () => {
    const state = {
      desired: { ...allOpen(), rail: false, right: false },
      lastManualExpand: 'cuts' as const,
    };
    expect(parseStoredPanels(serializePanels(state))).toEqual(state);
  });

  it('rejeita null, JSON inválido e formatos errados', () => {
    expect(parseStoredPanels(null)).toBeNull();
    expect(parseStoredPanels('')).toBeNull();
    expect(parseStoredPanels('{nope')).toBeNull();
    expect(parseStoredPanels('42')).toBeNull();
    expect(parseStoredPanels('{"desired":"tudo"}')).toBeNull();
  });

  it('chaves ausentes voltam ao default e valores não-booleanos são ignorados', () => {
    const parsed = parseStoredPanels('{"desired":{"rail":false,"cuts":"sim","extra":true}}');
    expect(parsed).not.toBeNull();
    expect(parsed?.desired.rail).toBe(false);
    expect(parsed?.desired.cuts).toBe(true);
    expect(parsed?.desired.fila).toBe(true);
    expect(parsed?.lastManualExpand).toBeNull();
  });

  it('lastManualExpand inválido vira null', () => {
    const parsed = parseStoredPanels('{"desired":{"rail":true},"lastManualExpand":"inexistente"}');
    expect(parsed?.lastManualExpand).toBeNull();
  });
});

describe('isWorkbenchPanelId', () => {
  it('aceita os 6 painéis do shell e rejeita o resto', () => {
    for (const id of ['rail', 'cuts', 'right', 'fila', 'cenas', 'layout']) {
      expect(isWorkbenchPanelId(id)).toBe(true);
    }
    expect(isWorkbenchPanelId('sidebar')).toBe(false);
    expect(isWorkbenchPanelId(null)).toBe(false);
    expect(isWorkbenchPanelId(3)).toBe(false);
  });
});
