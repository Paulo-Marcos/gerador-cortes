import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoModoFoco } from '@/features/editor/BotaoModoFoco';
import {
  SHORTCUTS_REGISTRY,
  assertNoShortcutConflicts,
  shortcutCombo,
} from '@/shared/atalhos/shortcutsRegistry';
import {
  FOCO_INICIAL,
  alternarFoco,
  aoMudarTelaCheia,
  entrarNoFoco,
  escSaiDoFoco,
  focoVale,
  partesDaCasca,
  partesDoEditor,
  sairDoFoco,
  storeDoFoco,
} from '../modoFoco';
import { TRILHO_FORA } from '../useTrilho';

// D-1085: o interruptor que apaga a casca e põe o navegador em tela cheia.

afterEach(() => {
  storeDoFoco.zerar();
  vi.unstubAllGlobals();
});

describe('entrar, sair e sincronizar com a tela cheia', () => {
  it('o mesmo gesto entra e sai', () => {
    const dentro = alternarFoco(FOCO_INICIAL);
    expect(dentro.ativo).toBe(true);
    expect(alternarFoco(dentro)).toEqual(FOCO_INICIAL);
  });

  it('sair pelo navegador (Esc/F11) tira o foco também', () => {
    const emTela = aoMudarTelaCheia(entrarNoFoco(FOCO_INICIAL), true);
    expect(emTela).toEqual({ ativo: true, telaCheia: true });
    expect(aoMudarTelaCheia(emTela, false)).toEqual(FOCO_INICIAL);
  });

  it('tela cheia recusada: o foco da casca continua e nada quebra', () => {
    const recusado = entrarNoFoco(FOCO_INICIAL);
    // sem evento nenhum, ou com um "saiu" que nunca foi "entrou"
    expect(aoMudarTelaCheia(recusado, false)).toBe(recusado);
  });

  it('tela cheia que não é do foco não o liga', () => {
    expect(aoMudarTelaCheia(FOCO_INICIAL, true)).toBe(FOCO_INICIAL);
  });

  it('sem tela cheia, o Esc da página sai; com ela, quem sai é o navegador', () => {
    const ativo = entrarNoFoco(FOCO_INICIAL);
    expect(escSaiDoFoco(ativo, false)).toBe(true);
    expect(escSaiDoFoco(ativo, true)).toBe(false);
    expect(escSaiDoFoco(FOCO_INICIAL, false)).toBe(false);
  });

  it('o foco só vale na tela do editor', () => {
    const ativo = entrarNoFoco(FOCO_INICIAL);
    expect(focoVale(ativo, true)).toBe(true);
    expect(focoVale(ativo, false)).toBe(false);
    expect(sairDoFoco(ativo)).toEqual(FOCO_INICIAL);
  });
});

describe('o que some e o que fica', () => {
  it('no foco somem trilho, barra, trilha, contexto, cabeçalho e ações', () => {
    expect(partesDaCasca(true)).toEqual({
      trilho: false,
      barraSuperior: false,
      trilhaDeEtapas: false,
      colunaDeContexto: false,
      cabecalho: false,
      barraDeAcoes: false,
    });
  });

  it('fora do foco a casca é a de sempre', () => {
    expect(Object.values(partesDaCasca(false)).every(Boolean)).toBe(true);
    expect(partesDoEditor(false)).toEqual({ faixaDeTempos: true, colunaDeTrechos: true });
  });

  it('no foco o editor perde a coluna de trechos e a faixa de tempos', () => {
    expect(partesDoEditor(true)).toEqual({ faixaDeTempos: false, colunaDeTrechos: false });
  });

  it('a casca e o editor leem as partes do foco, em cada moldura', () => {
    const casca = readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf8');
    for (const parte of ['trilho', 'barraSuperior', 'trilhaDeEtapas', 'colunaDeContexto', 'cabecalho', 'barraDeAcoes']) {
      expect(casca).toContain(`parte.${parte}`);
    }
    const editor = readFileSync(resolve(__dirname, '../../features/editor/fase1/EditorFase1.tsx'), 'utf8');
    expect(editor).toContain('colunaDeTrechos');
  });
});

describe('o foco não grava nas escolhas das colunas', () => {
  it('entrar, sincronizar e sair não escrevem no localStorage', () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem, removeItem } });
    storeDoFoco.aplicar(entrarNoFoco);
    storeDoFoco.aplicar((e) => aoMudarTelaCheia(e, true));
    storeDoFoco.aplicar((e) => aoMudarTelaCheia(e, false));
    storeDoFoco.aplicar(alternarFoco);
    storeDoFoco.aplicar(sairDoFoco);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('as chaves das colunas não aparecem nos módulos do foco', () => {
    const fontes = ['../modoFoco.ts', '../useModoFoco.ts'].map((f) =>
      readFileSync(resolve(__dirname, f), 'utf8'),
    );
    for (const fonte of fontes) {
      expect(fonte).not.toContain('localStorage');
      expect(fonte).not.toContain(TRILHO_FORA);
      expect(fonte).not.toContain('editor-trechos-recolhidos');
      expect(fonte).not.toContain('upgrade-coluna-recolhida');
    }
  });
});

describe('o atalho', () => {
  it('Shift+F está no registro, sem conflito com F (Fire) nem L (leitura)', () => {
    const spec = SHORTCUTS_REGISTRY.find((s) => s.id === 'bruto.modoFoco');
    expect(spec && shortcutCombo(spec)).toBe('Shift+F');
    expect(() => assertNoShortcutConflicts()).not.toThrow();
  });

  it('o editor liga o atalho do registro à ação', () => {
    const hook = readFileSync(resolve(__dirname, '../../features/editor/useEditorPage.tsx'), 'utf8');
    expect(hook).toContain("'bruto.modoFoco'");
    expect(hook).toContain('alternarModoFoco');
  });

  it('o botão leva o atalho no title e diz o estado', () => {
    const fora = renderToStaticMarkup(<BotaoModoFoco ativo={false} />);
    expect(fora).toContain('Shift+F');
    expect(fora).toContain('aria-pressed="false"');
    const dentro = renderToStaticMarkup(<BotaoModoFoco ativo flutuante />);
    expect(dentro).toContain('Sair do modo foco');
    expect(dentro).toContain('aria-pressed="true"');
  });
});
