// ─────────────────────────────────────────────────────────────────
// D-1085 · Modo foco de edição.
//
// Um interruptor só: some a casca inteira e o navegador vai para a tela
// cheia, sobrando o player e a onda. O foco é um estado À PARTE das
// escolhas de coluna (D-869 trilho, D-610 trechos, coluna de contexto): a
// casca e o editor apenas DEIXAM DE DESENHAR as molduras enquanto ele vale.
// Nada aqui grava no armazenamento do navegador — por isso, ao sair, cada coluna volta
// como a pessoa a deixou.
// ─────────────────────────────────────────────────────────────────

/** `telaCheia`: o navegador JÁ entrou em tela cheia por causa do foco. É o
 *  que permite distinguir "saiu da tela cheia" (acaba o foco) de "nunca
 *  entrou" (a API recusou: o foco da casca continua valendo). */
export type EstadoFoco = { ativo: boolean; telaCheia: boolean };

export const FOCO_INICIAL: EstadoFoco = { ativo: false, telaCheia: false };

export function entrarNoFoco(e: EstadoFoco): EstadoFoco {
  return e.ativo ? e : { ativo: true, telaCheia: false };
}

export function sairDoFoco(e: EstadoFoco): EstadoFoco {
  return e.ativo || e.telaCheia ? FOCO_INICIAL : e;
}

export function alternarFoco(e: EstadoFoco): EstadoFoco {
  return e.ativo ? sairDoFoco(e) : entrarNoFoco(e);
}

/** O navegador avisou (`fullscreenchange`) que está ou não em tela cheia. */
export function aoMudarTelaCheia(e: EstadoFoco, emTelaCheia: boolean): EstadoFoco {
  if (!e.ativo) return e;
  if (emTelaCheia) return e.telaCheia ? e : { ...e, telaCheia: true };
  // Saiu da tela cheia que o foco pediu (Esc/F11 nativos): o foco sai junto.
  return e.telaCheia ? FOCO_INICIAL : e;
}

/** Esc sem tela cheia (a API recusou): é o Esc da página que tira do foco.
 *  Com tela cheia o navegador consome o Esc e avisa por `fullscreenchange`. */
export function escSaiDoFoco(e: EstadoFoco, emTelaCheia: boolean): boolean {
  return e.ativo && !emTelaCheia;
}

/** O foco só vale na tela do editor; em qualquer outra ele acaba. */
export function focoVale(e: EstadoFoco, noEditor: boolean): boolean {
  return e.ativo && noEditor;
}

/** O que a casca desenha. No foco, nada além do conteúdo da tela. */
export function partesDaCasca(foco: boolean) {
  return {
    trilho: !foco,
    barraSuperior: !foco,
    trilhaDeEtapas: !foco,
    colunaDeContexto: !foco,
    cabecalho: !foco,
    // Aprovar/rejeitar seguem em A e R; a barra comeria a altura da onda.
    barraDeAcoes: !foco,
  };
}

/** A coluna de trechos: o foco a esconde sem tocar na escolha lembrada (D-610),
 *  e o botão de reabri-la também some enquanto ele vale. */
export function trechosNoFoco(escolhaRecolhida: boolean, foco: boolean) {
  return {
    recolhidos: escolhaRecolhida || !partesDoEditor(foco).colunaDeTrechos,
    mostrarReabrir: escolhaRecolhida && !foco,
  };
}

/** O que o editor desenha: só o player e a onda. */
export function partesDoEditor(foco: boolean) {
  return { faixaDeTempos: !foco, colunaDeTrechos: !foco };
}

// ── store (um por aba) ──────────────────────────────────────────

let estado: EstadoFoco = FOCO_INICIAL;
const ouvintes = new Set<() => void>();

function definir(proximo: EstadoFoco) {
  if (proximo === estado) return;
  estado = proximo;
  ouvintes.forEach((o) => o());
}

export const storeDoFoco = {
  ler: () => estado,
  assinar(ouvinte: () => void) {
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  },
  /** Só para os testes: volta ao zero. */
  zerar: () => definir(FOCO_INICIAL),
  aplicar: (f: (e: EstadoFoco) => EstadoFoco) => definir(f(estado)),
};

function emTelaCheia(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}

/** Entra/sai do foco. O pedido de tela cheia sai AQUI, no mesmo gesto do
 *  atalho (o navegador só aceita dentro de um gesto); recusa é silenciosa. */
export function alternarModoFoco() {
  const entrando = !estado.ativo;
  storeDoFoco.aplicar(alternarFoco);
  if (typeof document === 'undefined') return;
  if (entrando) {
    document.documentElement.requestFullscreen?.()?.catch(() => undefined);
  } else if (emTelaCheia()) {
    document.exitFullscreen?.()?.catch(() => undefined);
  }
}

/** Sai do foco (e da tela cheia) sem alternar — usado ao deixar o editor e no Esc. */
export function sairDoModoFoco() {
  if (!estado.ativo) return;
  storeDoFoco.aplicar(sairDoFoco);
  if (typeof document !== 'undefined' && emTelaCheia()) {
    document.exitFullscreen?.()?.catch(() => undefined);
  }
}

/** Liga o foco ao navegador: `fullscreenchange` (Esc/F11 nativos tiram o foco)
 *  e o Esc da página quando a tela cheia foi recusada. Devolve o desligar. */
export function ligarFocoAoNavegador(
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'fullscreenElement'>,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  overlayAberto: () => boolean,
): () => void {
  const aoMudar = () =>
    storeDoFoco.aplicar((e) => aoMudarTelaCheia(e, doc.fullscreenElement != null));
  const aoTeclar = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || overlayAberto()) return;
    if (escSaiDoFoco(estado, doc.fullscreenElement != null)) sairDoModoFoco();
  };
  doc.addEventListener('fullscreenchange', aoMudar);
  win.addEventListener('keydown', aoTeclar);
  return () => {
    doc.removeEventListener('fullscreenchange', aoMudar);
    win.removeEventListener('keydown', aoTeclar);
  };
}

/** Ao sair da tela do editor o foco acaba (e a tela cheia com ele). */
export function aoSairDoEditor(noEditor: boolean): void {
  if (!noEditor) sairDoModoFoco();
}

/** Ctrl+B: no foco o trilho está escondido, então a tecla não pode mudar a
 *  escolha da D-869 sem ninguém ver. */
export function alternarTrilhoForaDoFoco(trilhoVisivel: boolean, alternar: () => void) {
  return trilhoVisivel ? alternar : () => undefined;
}
