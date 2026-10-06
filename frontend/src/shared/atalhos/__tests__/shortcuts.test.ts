import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShortcuts, type ShortcutBinding } from '../shortcuts';

// D-887: sem DOM no ambiente de teste. O efeito roda na hora e o `window`
// anota o handler de keydown; o `document` responde se há overlay na tela.
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return { ...react, useEffect: (efeito: () => void) => void efeito() };
});

let aoTeclar: (e: KeyboardEvent) => void;
let comOverlay = false;

beforeEach(() => {
  vi.stubGlobal('window', {
    addEventListener: (_tipo: string, handler: (e: KeyboardEvent) => void) => {
      aoTeclar = handler;
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal('document', { querySelector: () => (comOverlay ? {} : null) });
});

afterEach(() => {
  comOverlay = false;
  vi.unstubAllGlobals();
});

function tecla(key: string, mods: { ctrl?: boolean; shift?: boolean } = {}) {
  const e = {
    key,
    code: /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : '',
    ctrlKey: mods.ctrl ?? false,
    metaKey: false,
    shiftKey: mods.shift ?? false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
  };
  aoTeclar(e as unknown as KeyboardEvent);
  return e;
}

function Teclado({ bindings }: { bindings: ShortcutBinding[] }) {
  useShortcuts(bindings);
  return null;
}

function ligar(...bindings: Partial<ShortcutBinding>[]) {
  const completos = bindings.map((b) => ({
    description: '',
    group: 'edicao' as const,
    key: 'a',
    action: vi.fn(),
    ...b,
  }));
  renderToStaticMarkup(createElement(Teclado, { bindings: completos }));
  return completos.map((b) => b.action);
}

describe('useShortcuts com diálogo, menu ou popover aberto (D-887)', () => {
  it('sem overlay, A aprova', () => {
    const [aprovar] = ligar({ key: 'a' });
    tecla('a');
    expect(aprovar).toHaveBeenCalledOnce();
  });

  it('com overlay, A, R, F e espaço não agem no corte de trás nem engolem a tecla', () => {
    comOverlay = true;
    const acoes = ligar({ key: 'a' }, { key: 'r' }, { key: 'f' }, { key: ' ' });
    const eventos = ['a', 'r', 'f', ' '].map((k) => tecla(k));
    for (const acao of acoes) expect(acao).not.toHaveBeenCalled();
    // O espaço num botão do modal tem de chegar ao botão.
    for (const e of eventos) expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('com overlay, Shift+? também se cala: o Shift não faz da tecla um comando', () => {
    comOverlay = true;
    const [ajuda] = ligar({ key: '?', mod: 'shift' });
    tecla('?', { shift: true });
    expect(ajuda).not.toHaveBeenCalled();
  });

  it('com overlay, Ctrl+S segue salvando e tira o "salvar página" do navegador', () => {
    comOverlay = true;
    const [salvar] = ligar({ key: 's', mod: 'any' });
    const e = tecla('s', { ctrl: true });
    expect(salvar).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('valeComModal mantém vivo o atalho que fecha o próprio modal', () => {
    comOverlay = true;
    const [porQue] = ligar({ key: 'w', valeComModal: true });
    tecla('w');
    expect(porQue).toHaveBeenCalledOnce();
  });
});
