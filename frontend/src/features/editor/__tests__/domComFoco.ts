import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { assentar } from './domMinimo';

// D-1201: um DOM que desenha de verdade e sabe onde está o foco, sem jsdom no
// projeto. Imita as duas regras do navegador que o defeito usa: `focus()` só pega
// em quem é focável (botão, link com href ou `tabindex`), e tirar da árvore o nó
// focado joga o foco para o <body>.

export class No {
  childNodes: No[] = [];
  parentNode: No | null = null;
  atributos = new Map<string, string>();
  style = { setProperty() {}, removeProperty() {} };
  nodeValue: string | null = null;
  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    public ownerDocument: Documento | null,
    readonly namespaceURI = 'http://www.w3.org/1999/xhtml',
  ) {}
  get tagName() {
    return this.nodeName;
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
  set textContent(texto: string) {
    for (const filho of [...this.childNodes]) this.removeChild(filho);
    if (texto) {
      const no = new No(3, '#text', this.ownerDocument);
      no.nodeValue = texto;
      this.appendChild(no);
    }
  }
  get textContent(): string {
    return this.nodeType === 3 ? (this.nodeValue ?? '') : this.childNodes.map((c) => c.textContent).join('');
  }
  setAttribute(nome: string, valor: unknown) {
    this.atributos.set(nome.toLowerCase(), String(valor));
  }
  getAttribute(nome: string) {
    return this.atributos.get(nome.toLowerCase()) ?? null;
  }
  removeAttribute(nome: string) {
    this.atributos.delete(nome.toLowerCase());
  }
  appendChild(filho: No) {
    return this.insertBefore(filho, null);
  }
  insertBefore(filho: No, antes: No | null) {
    filho.parentNode?.childNodes.splice(filho.parentNode.childNodes.indexOf(filho), 1);
    filho.parentNode = this;
    const i = antes ? this.childNodes.indexOf(antes) : this.childNodes.length;
    this.childNodes.splice(i, 0, filho);
    return filho;
  }
  removeChild(filho: No) {
    const documento = this.ownerDocument;
    if (documento && filho.contem(documento.activeElement)) documento.activeElement = documento.body;
    this.childNodes.splice(this.childNodes.indexOf(filho), 1);
    filho.parentNode = null;
    return filho;
  }
  contem(outro: No | null): boolean {
    return !!outro && (outro === this || this.childNodes.some((c) => c.contem(outro)));
  }
  focus() {
    const focavel =
      this.nodeName === 'BUTTON' ||
      (this.nodeName === 'A' && this.atributos.has('href')) ||
      this.atributos.has('tabindex');
    if (focavel && this.ownerDocument) this.ownerDocument.activeElement = this;
  }
  /** O primeiro nó (em ordem de documento) que passa no teste. */
  achar(teste: (no: No) => boolean): No | null {
    if (teste(this)) return this;
    for (const filho of this.childNodes) {
      const achado = filho.achar(teste);
      if (achado) return achado;
    }
    return null;
  }
  addEventListener() {}
  removeEventListener() {}
}

class Documento {
  readonly nodeType = 9;
  readonly body = new No(1, 'BODY', null);
  activeElement: No = this.body;
  constructor() {
    this.body.ownerDocument = this;
  }
  createElement(tag: string) {
    return new No(1, tag.toUpperCase(), this);
  }
  createElementNS(ns: string, tag: string) {
    return new No(1, tag, this, ns);
  }
  createTextNode(texto: string) {
    const no = new No(3, '#text', this);
    no.nodeValue = texto;
    return no;
  }
  addEventListener() {}
  removeEventListener() {}
}

/** Clica como o React ouviria: chama o `onClick` das props do nó desenhado. */
export function clicar(no: No) {
  const chave = Object.keys(no).find((k) => k.startsWith('__reactProps$'))!;
  const props = (no as unknown as Record<string, { onClick: (e: unknown) => void }>)[chave];
  no.focus();
  props.onClick({ button: 0, preventDefault() {}, stopPropagation() {} });
}

const GLOBAIS = ['window', 'document', 'HTMLIFrameElement', 'IS_REACT_ACT_ENVIRONMENT', 'addEventListener', 'removeEventListener'];
const global = globalThis as Record<string, unknown>;

export function montarComFoco(arvore: ReactNode) {
  const documento = new Documento();
  global.window = globalThis;
  global.document = documento;
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  global.addEventListener = () => undefined;
  global.removeEventListener = () => undefined;
  const conteiner = documento.createElement('div');
  documento.body.appendChild(conteiner);
  const raiz = createRoot(conteiner as unknown as HTMLElement);
  raiz.render(arvore);
  return {
    documento,
    limpar: async () => {
      raiz.unmount();
      await assentar();
      for (const nome of GLOBAIS) delete global[nome];
    },
  };
}
