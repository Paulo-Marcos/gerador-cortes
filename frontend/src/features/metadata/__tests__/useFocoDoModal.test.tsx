import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocoDoModal } from '../useFocoDoModal';

// D-967 · digitando o título do YouTube no modal de metadados, o foco pulava
// para o botão "Fechar". O pai entrega `aoFechar` como função nova a cada
// render (refetch da lista, polling); o efeito do foco dependia dela, então
// cada render do pai devolvia o foco ao gatilho e o reaplicava no 1º botão.
//
// O render de servidor não roda efeitos: aqui roda o React DOM de verdade
// sobre o mínimo que o hook toca — a caixa é um objeto à parte do DOM.

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

let raiz: Root;
const global = globalThis as Record<string, unknown>;
const gatilho = { nodeName: 'BUTTON', focus: vi.fn() };
const primeiroBotao = { focus: vi.fn() };
const caixa = { current: { querySelector: () => primeiroBotao } as unknown as HTMLElement };
const ouvintes = new Set<(e: KeyboardEvent) => void>();

const assentar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function Modal({ aoFechar }: { aoFechar: () => void }) {
  useFocoDoModal(caixa, aoFechar);
  return null;
}

beforeEach(() => {
  gatilho.focus.mockClear();
  primeiroBotao.focus.mockClear();
  ouvintes.clear();
  global.window = globalThis;
  global.document = {
    ...vazio(),
    activeElement: gatilho,
    // O React também ouve o documento (selectionchange); aqui só conta o Esc.
    addEventListener: (tipo: string, f: (e: KeyboardEvent) => void) =>
      tipo === 'keydown' && ouvintes.add(f),
    removeEventListener: (_: string, f: (e: KeyboardEvent) => void) => ouvintes.delete(f),
  };
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  const container = { ...vazio(), ownerDocument: global.document };
  raiz = createRoot(container as unknown as HTMLElement);
});

afterEach(async () => {
  raiz.unmount();
  await assentar();
  delete global.window;
  delete global.document;
  delete global.HTMLIFrameElement;
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

describe('useFocoDoModal', () => {
  it('re-render do pai com aoFechar novo não mexe no foco de quem digita', async () => {
    raiz.render(<Modal aoFechar={() => {}} />);
    await assentar();
    expect(primeiroBotao.focus).toHaveBeenCalledTimes(1);

    raiz.render(<Modal aoFechar={() => {}} />);
    raiz.render(<Modal aoFechar={() => {}} />);
    await assentar();

    expect(primeiroBotao.focus).toHaveBeenCalledTimes(1);
    expect(gatilho.focus).not.toHaveBeenCalled();
  });

  it('Esc chama o aoFechar mais recente e, ao fechar, o foco volta ao gatilho', async () => {
    const antigo = vi.fn();
    const atual = vi.fn();
    raiz.render(<Modal aoFechar={antigo} />);
    raiz.render(<Modal aoFechar={atual} />);
    await assentar();

    const esc = { key: 'Escape', stopPropagation: vi.fn() } as unknown as KeyboardEvent;
    ouvintes.forEach((f) => f(esc));
    expect(atual).toHaveBeenCalledTimes(1);
    expect(antigo).not.toHaveBeenCalled();

    raiz.unmount();
    await assentar();
    expect(gatilho.focus).toHaveBeenCalledTimes(1);
    expect(ouvintes.size).toBe(0);
    raiz = createRoot({ ...vazio(), ownerDocument: global.document } as unknown as HTMLElement);
  });
});
