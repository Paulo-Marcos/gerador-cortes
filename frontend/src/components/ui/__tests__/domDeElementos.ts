import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// D-1197: React DOM de verdade desenhando ELEMENTOS, sem jsdom no projeto. O
// `domMinimo` do editor só serve a sondas que não desenham nada; aqui o teste precisa
// ver o diálogo, digitar no campo e apertar botão. Os eventos não passam pelo DOM:
// o teste chama o manipulador que o React guardou no nó (`__reactProps$…`).

export class No {
  childNodes: No[] = [];
  parentNode: No | null = null;
  attributes: Record<string, string> = {};
  style: Record<string, unknown> = { setProperty() {} };
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  value = '';
  texto = '';

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: unknown,
  ) {}

  get tagName() {
    return this.nodeName;
  }
  /** O React escolhe a opção do `<select>` por aqui. */
  get options(): No[] {
    return this.childNodes.filter((f) => f.nodeName === 'OPTION');
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling(): No | null {
    const irmaos = this.parentNode?.childNodes ?? [];
    return irmaos[irmaos.indexOf(this) + 1] ?? null;
  }
  get textContent(): string {
    return this.nodeType === 3 ? this.texto : this.childNodes.map((f) => f.textContent).join('');
  }
  set textContent(valor: string) {
    this.childNodes = [];
    if (this.nodeType === 3) this.texto = valor;
    else if (valor) this.appendChild(texto(valor, this.ownerDocument));
  }
  set nodeValue(valor: string) {
    this.texto = valor;
  }

  appendChild(filho: No) {
    return this.insertBefore(filho, null);
  }
  insertBefore(filho: No, antes: No | null) {
    filho.parentNode?.removeChild(filho);
    const i = antes ? this.childNodes.indexOf(antes) : -1;
    if (i < 0) this.childNodes.push(filho);
    else this.childNodes.splice(i, 0, filho);
    filho.parentNode = this;
    return filho;
  }
  removeChild(filho: No) {
    this.childNodes = this.childNodes.filter((f) => f !== filho);
    filho.parentNode = null;
    return filho;
  }
  setAttribute(nome: string, valor: unknown) {
    this.attributes[nome] = String(valor);
  }
  setAttributeNS(_: string, nome: string, valor: unknown) {
    this.setAttribute(nome, valor);
  }
  getAttribute(nome: string) {
    return this.attributes[nome] ?? null;
  }
  removeAttribute(nome: string) {
    delete this.attributes[nome];
  }
  addEventListener() {}
  removeEventListener() {}
  focus() {}

  /** As props que o React deu a este nó — é por elas que o teste age. */
  get props(): Record<string, unknown> {
    const chave = Object.keys(this).find((k) => k.startsWith('__reactProps$'));
    return chave ? (this as unknown as Record<string, Record<string, unknown>>)[chave] : {};
  }

  todos(): No[] {
    return [this, ...this.childNodes.flatMap((f) => f.todos())];
  }
}

function texto(valor: string, dono: unknown) {
  const no = new No(3, '#text', dono);
  no.texto = valor;
  return no;
}

export const assentar = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const GLOBAIS = ['window', 'document', 'HTMLIFrameElement', 'IS_REACT_ACT_ENVIRONMENT'];
const global = globalThis as Record<string, unknown>;

export function montarComElementos(arvore: ReactNode) {
  const documento: Record<string, unknown> = {
    nodeType: 9,
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  };
  documento.createElement = (tag: string) => new No(1, tag.toUpperCase(), documento);
  documento.createElementNS = (_: string, tag: string) => new No(1, tag, documento);
  documento.createTextNode = (valor: string) => texto(valor, documento);
  documento.documentElement = new No(1, 'HTML', documento);
  global.window = globalThis;
  global.document = documento;
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;

  const corpo = new No(1, 'DIV', documento);
  const raiz: Root = createRoot(corpo as unknown as HTMLElement);
  raiz.render(arvore);

  const achar = (teste: (no: No) => boolean) => corpo.todos().filter((n) => n.nodeType === 1 && teste(n));
  const um = (descricao: string, teste: (no: No) => boolean) => {
    const [no] = achar(teste);
    if (!no) throw new Error(`não achei ${descricao}; a tela diz: ${corpo.textContent}`);
    return no;
  };
  const evento = (target?: unknown) => ({ target, preventDefault() {}, stopPropagation() {} });
  const disparar = async (no: No, nome: string, extra: object = {}) => {
    (no.props[nome] as (e: unknown) => void)({ ...evento(no), ...extra });
    await assentar();
  };

  return {
    texto: () => corpo.textContent,
    achar,
    porId: (id: string) => um(`#${id}`, (n) => n.props.id === id),
    botao: (rotulo: string) =>
      um(`o botão "${rotulo}"`, (n) => n.nodeName === 'BUTTON' && n.textContent.trim() === rotulo),
    disparar,
    digitar: async (no: No, valor: string) => {
      no.value = valor;
      await disparar(no, 'onChange', { target: { value: valor } });
    },
    limpar: async () => {
      raiz.unmount();
      await assentar();
      for (const nome of GLOBAIS) delete global[nome];
    },
  };
}
