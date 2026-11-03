import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

// React DOM de verdade para testar hook com efeito, troca de tela e desmonte: o
// render de servidor dos outros testes não roda efeito nem guarda estado. Serve
// para sondas que não desenham nada (`return null`), sem jsdom no projeto.

/** O que o React DOM pede do contêiner quando a tela não desenha nada. */
function conteiner(dono: unknown) {
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: dono,
    childNodes: [],
    firstChild: null,
    lastChild: null,
    addEventListener() {},
    removeEventListener() {},
  };
}

/** Deixa rodar as tarefas que o React, o roteador e as promessas agendaram. */
export const assentar = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const GLOBAIS = ['window', 'document', 'HTMLIFrameElement', 'IS_REACT_ACT_ENVIRONMENT', 'addEventListener', 'removeEventListener', 'localStorage'];
const global = globalThis as Record<string, unknown>;

/** Monta a árvore; devolve quem desmonta a raiz e quem limpa os globais. */
export function montar(arvore: ReactNode, guardado: Record<string, string> = {}) {
  const documento = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
  global.window = globalThis;
  global.document = documento;
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  global.addEventListener = () => undefined;
  global.removeEventListener = () => undefined;
  global.localStorage = {
    getItem: (chave: string) => guardado[chave] ?? null,
    setItem: (chave: string, valor: string) => {
      guardado[chave] = valor;
    },
    removeItem: (chave: string) => {
      delete guardado[chave];
    },
  };
  const raiz: Root = createRoot(conteiner(documento) as unknown as HTMLElement);
  raiz.render(arvore);
  return {
    desmontar: () => raiz.unmount(),
    limpar: async () => {
      raiz.unmount();
      await assentar();
      for (const nome of GLOBAIS) delete global[nome];
    },
  };
}
