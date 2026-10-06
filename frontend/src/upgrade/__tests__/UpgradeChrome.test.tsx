import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpgradeChromeProvider, useChrome, useDefinirChrome } from '../UpgradeChrome';

// D-880 · a tela e a casca chegam JUNTAS ao DOM. Com a publicação em
// `useEffect`, a troca de live no Workspace deixava um estado intermediário
// por 45 a 81 ms (medido no navegador): a lista da live nova sob o título e o
// "Aprovar os 6 propostos" da anterior. O efeito comum roda numa tarefa
// depois do commit — e o navegador pinta entre as duas.
//
// O render de servidor, que os outros testes usam, não roda efeito nenhum.
// Aqui roda o React DOM de verdade sobre um DOM mínimo, e cada mutação agenda
// uma foto numa microtarefa — o que um MutationObserver veria. Uma foto com
// tela e casca de lives diferentes é o quadro errado.

type Foto = { casca: string; tela: string };

class No {
  childNodes: No[] = [];
  parentNode: No | null = null;
  style: Record<string, string> = {};
  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: Documento | null,
    private valor = '',
  ) {}
  get firstChild(): No | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): No | null {
    return this.childNodes.at(-1) ?? null;
  }
  get tagName() {
    return this.nodeName;
  }
  get namespaceURI() {
    return 'http://www.w3.org/1999/xhtml';
  }
  get nodeValue() {
    return this.valor;
  }
  set nodeValue(v: string) {
    this.valor = v;
    this.ownerDocument?.mudou();
  }
  get textContent(): string {
    return this.nodeType === 3 ? this.valor : this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    if (this.nodeType === 3) this.nodeValue = v;
    else {
      this.childNodes = [];
      if (v) this.appendChild(this.ownerDocument!.createTextNode(v));
      this.ownerDocument?.mudou();
    }
  }
  appendChild(filho: No) {
    return this.insertBefore(filho, null);
  }
  insertBefore(filho: No, antes: No | null) {
    filho.parentNode?.removeChild(filho);
    const i = antes ? this.childNodes.indexOf(antes) : -1;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, filho);
    filho.parentNode = this;
    this.ownerDocument?.mudou();
    return filho;
  }
  removeChild(filho: No) {
    this.childNodes = this.childNodes.filter((c) => c !== filho);
    filho.parentNode = null;
    this.ownerDocument?.mudou();
    return filho;
  }
  querySelector(tag: string): No | null {
    for (const c of this.childNodes) {
      if (c.nodeName === tag.toUpperCase()) return c;
      const achado = c.querySelector(tag);
      if (achado) return achado;
    }
    return null;
  }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  removeEventListener() {}
}

class Documento extends No {
  fotos: Foto[] = [];
  private agendada = false;
  readonly body: No;
  constructor() {
    super(9, '#document', null);
    this.body = this.createElement('body');
  }
  createElement(tag: string) {
    return new No(1, tag.toUpperCase(), this);
  }
  createTextNode(texto: string) {
    return new No(3, '#text', this, texto);
  }
  get activeElement() {
    return this.body;
  }
  /** Uma foto por rajada de mutações, no fim da tarefa — como o observer. */
  mudou() {
    if (this.agendada) return;
    this.agendada = true;
    queueMicrotask(() => {
      this.agendada = false;
      const ler = (tag: string) => this.body.querySelector(tag)?.textContent ?? '';
      this.fotos.push({ casca: ler('h1'), tela: ler('p') });
    });
  }
}

/** Deixa rodar as tarefas que o React agendou (efeitos, renders seguintes). */
const assentar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function Casca({ children }: { children: ReactNode }) {
  return (
    <>
      <h1>{useChrome().titulo ?? 'sem título'}</h1>
      {children}
    </>
  );
}

function Workspace({ live }: { live: string }) {
  useDefinirChrome({ titulo: live }, [live]);
  return <p>{live}</p>;
}

function Editor() {
  useDefinirChrome({ titulo: 'Corte #7' }, []);
  return <p>Corte #7</p>;
}

let doc: Documento;
let raiz: Root;
const global = globalThis as Record<string, unknown>;

beforeEach(() => {
  doc = new Documento();
  global.window = globalThis;
  global.document = doc;
  // O commit procura o foco dentro de iframes; aqui não há nenhum.
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  raiz = createRoot(doc.body as unknown as HTMLElement);
});

afterEach(async () => {
  raiz.unmount();
  // A desmontagem ainda agenda trabalho; os globais só saem depois dele.
  await assentar();
  delete global.window;
  delete global.document;
  delete global.HTMLIFrameElement;
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

const montar = async (tela: ReactNode) => {
  raiz.render(
    <UpgradeChromeProvider>
      <Casca>{tela}</Casca>
    </UpgradeChromeProvider>,
  );
  await assentar();
};

describe('useDefinirChrome · tela e casca no mesmo quadro', () => {
  it('ao trocar de live, nenhuma foto mostra a lista nova sob a casca da anterior', async () => {
    await montar(<Workspace live="LIVE 266" />);
    doc.fotos = [];

    await montar(<Workspace live="LIVE 267" />);

    expect(doc.fotos.length).toBeGreaterThan(0);
    expect(doc.fotos.filter((f) => f.tela !== f.casca)).toEqual([]);
    expect(doc.fotos.at(-1)).toEqual({ casca: 'LIVE 267', tela: 'LIVE 267' });
  });

  it('ao trocar de tela, a que entra publica depois da limpeza da que sai', async () => {
    await montar(<Workspace live="LIVE 267" />);
    doc.fotos = [];

    await montar(<Editor />);

    expect(doc.fotos.filter((f) => f.tela !== f.casca)).toEqual([]);
    expect(doc.fotos.at(-1)).toEqual({ casca: 'Corte #7', tela: 'Corte #7' });
  });

  it('ao desmontar, a tela leva o chrome junto', async () => {
    await montar(<Workspace live="LIVE 267" />);

    await montar(null);

    expect(doc.fotos.at(-1)).toEqual({ casca: 'sem título', tela: '' });
  });
});
