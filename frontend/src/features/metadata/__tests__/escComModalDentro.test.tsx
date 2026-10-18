import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { escDeOutroModal, useFocoDoModal } from '../useFocoDoModal';

// D-968 · com a capa ampliada aberta DENTRO do modal de metadados, o Esc
// fechava o modal inteiro: o hook o ouve na captura e o engolia antes do modal
// da capa. Reabrir o de metadados perdia a capa nova. Quem está por cima fecha
// primeiro. Roda o hook de verdade, como em useFocoDoModal.test.tsx.

const vazio = () => ({
  nodeType: 1,
  nodeName: 'DIV',
  tagName: 'DIV',
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  childNodes: [],
  firstChild: null,
  addEventListener() {},
  removeEventListener() {},
});

// A caixa do modal de metadados (ela mesma um diálogo) e a capa ampliada dentro dela.
const capaAmpliada = { nome: 'capa' };
// Como no DOM, a caixa contém a si mesma — e ela também é um diálogo modal.
const elementoDaCaixa: { querySelector: () => unknown; contains: (outro: unknown) => boolean } = {
  querySelector: () => ({ focus() {} }),
  contains: (outro) => outro === capaAmpliada || outro === elementoDaCaixa,
};
const caixa = { current: elementoDaCaixa as unknown as HTMLElement };
const dentroDe = (dialogo: unknown) => ({ closest: () => dialogo }) as unknown as EventTarget;

let raiz: Root;
const global = globalThis as Record<string, unknown>;
const ouvintes = new Set<(e: KeyboardEvent) => void>();

const assentar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function Modal({ aoFechar }: { aoFechar: () => void }) {
  useFocoDoModal(caixa, aoFechar);
  return null;
}

beforeEach(() => {
  ouvintes.clear();
  global.window = globalThis;
  global.document = {
    ...vazio(),
    activeElement: { nodeName: 'BUTTON', focus() {} },
    addEventListener: (tipo: string, f: (e: KeyboardEvent) => void) =>
      tipo === 'keydown' && ouvintes.add(f),
    removeEventListener: (_: string, f: (e: KeyboardEvent) => void) => ouvintes.delete(f),
  };
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  raiz = createRoot({ ...vazio(), ownerDocument: global.document } as unknown as HTMLElement);
});

afterEach(async () => {
  raiz.unmount();
  await assentar();
  delete global.window;
  delete global.document;
  delete global.HTMLIFrameElement;
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

const teclarEsc = (target: EventTarget | null) => {
  const esc = { key: 'Escape', target, stopPropagation: vi.fn() } as unknown as KeyboardEvent;
  ouvintes.forEach((f) => f(esc));
  return esc;
};

describe('Esc com um modal aberto dentro (D-968)', () => {
  it('Esc dentro da capa ampliada é dela: não fecha o modal de metadados nem para a tecla', async () => {
    const aoFechar = vi.fn();
    raiz.render(<Modal aoFechar={aoFechar} />);
    await assentar();

    const esc = teclarEsc(dentroDe(capaAmpliada));
    expect(aoFechar).not.toHaveBeenCalled();
    expect(esc.stopPropagation).not.toHaveBeenCalled();
  });

  it('Esc no próprio modal de metadados o fecha', async () => {
    const aoFechar = vi.fn();
    raiz.render(<Modal aoFechar={aoFechar} />);
    await assentar();

    teclarEsc(dentroDe(elementoDaCaixa));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe('escDeOutroModal', () => {
  const el = elementoDaCaixa as unknown as HTMLElement;

  it('só é de outro modal quando o diálogo do alvo está dentro da caixa e não é ela', () => {
    expect(escDeOutroModal(dentroDe(capaAmpliada), el)).toBe(true);
    expect(escDeOutroModal(dentroDe(elementoDaCaixa), el)).toBe(false);
    expect(escDeOutroModal(dentroDe({ fora: true }), el)).toBe(false);
  });

  it('sem alvo, sem diálogo ou sem caixa, o Esc é da caixa', () => {
    expect(escDeOutroModal(null, el)).toBe(false);
    expect(escDeOutroModal(dentroDe(null), el)).toBe(false);
    expect(escDeOutroModal(dentroDe(capaAmpliada), null)).toBe(false);
  });
});
