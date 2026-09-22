import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · "não tenho como voltar para onde estava".
//
// A trilha situava, mas só sabia SUBIR na hierarquia: de um short ela
// levava a Shorts, nunca ao short anterior. E o trabalho real não é
// hierárquico — é short → outro short → uma live → volta. Um caminho
// lateral, que nada registrava.
//
// Duas estruturas, e é importante que sejam duas:
//
//   · PILHA (atras/frente): a ordem em que a pessoa ANDOU. É o que ← →
//     e ⌘[ ⌘] percorrem. Tem de ser pilha, porque voltar duas vezes e
//     avançar uma precisa devolver o meio.
//   · MRU (lugares): os últimos lugares DISTINTOS, deduplicados por rota
//     e limitados a 6. É o que "Onde eu estava" mostra e o que o ⌘K
//     oferece com a caixa vazia. Aqui pilha seria inútil: vinte entradas
//     do mesmo short não são vinte lugares.
//
// Sobrevive ao recarregamento (localStorage) porque o caso que doeu é
// justamente o F5 depois de um render longo.
// ─────────────────────────────────────────────────────────────────

export type Lugar = {
  /** Rota canônica — é a identidade do lugar. */
  to: string;
  rotulo: string;
  icone: IconName;
  /** "live", "short", "corte", "tela": o que o ⌘K mostra como dica. */
  tipo: string;
};

const CHAVE = 'upgrade-historico';
const MAX_MRU = 6;
const MAX_PILHA = 40;

type Estado = { atras: Lugar[]; frente: Lugar[]; lugares: Lugar[] };

const VAZIO: Estado = { atras: [], frente: [], lugares: [] };

function ler(): Estado {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return VAZIO;
    const j = JSON.parse(cru) as Partial<Estado>;
    // Payload malformado é descartado em silêncio: um histórico de versão
    // anterior não vale uma tela branca.
    return {
      atras: Array.isArray(j.atras) ? j.atras.slice(-MAX_PILHA) : [],
      frente: Array.isArray(j.frente) ? j.frente : [],
      lugares: Array.isArray(j.lugares) ? j.lugares.slice(0, MAX_MRU) : [],
    };
  } catch {
    return VAZIO;
  }
}

let atual: Estado = typeof window === 'undefined' ? VAZIO : ler();
const ouvintes = new Set<() => void>();

function publicar(proximo: Estado) {
  atual = proximo;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(proximo));
  } catch {
    // o histórico some ao recarregar; a sessão continua
  }
  ouvintes.forEach((a) => a());
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

const retrato = () => atual;

function mru(lugar: Lugar): Lugar[] {
  return [lugar].concat(atual.lugares.filter((l) => l.to !== lugar.to)).slice(0, MAX_MRU);
}

/** Registra uma visita. Chamada pela casca a cada troca de rota. */
export function visitar(lugar: Lugar) {
  const topo = atual.atras[atual.atras.length - 1];
  if (topo?.to === lugar.to) {
    // Mesma rota, rótulo novo (o título da live chegou depois do fetch):
    // atualiza sem empilhar — senão cada carregamento viraria um passo.
    publicar({ ...atual, atras: atual.atras.slice(0, -1).concat(lugar), lugares: mru(lugar) });
    return;
  }
  publicar({
    atras: atual.atras.concat(lugar).slice(-MAX_PILHA),
    // Andar para um lugar novo apaga o "avançar": é o comportamento que
    // todo navegador tem e que ninguém precisa aprender.
    frente: [],
    lugares: mru(lugar),
  });
}

/**
 * Visita vinda do histórico do NAVEGADOR (Alt+←, botão voltar do mouse).
 * Se ela leva ao lugar anterior da pilha, é um "voltar" — empilhá-la como
 * passo novo faria ⌘[ e o voltar do navegador discordarem, e o ⌘[ seguinte
 * devolveria à tela de onde se acabou de sair. Idem para "avançar".
 */
export function visitarPeloNavegador(lugar: Lugar) {
  const anterior = atual.atras[atual.atras.length - 2];
  if (anterior?.to === lugar.to) {
    const sai = atual.atras[atual.atras.length - 1];
    publicar({
      atras: atual.atras.slice(0, -2).concat(lugar),
      frente: [sai, ...atual.frente],
      lugares: mru(lugar),
    });
    return;
  }
  if (atual.frente[0]?.to === lugar.to) {
    publicar({ atras: atual.atras.concat(lugar), frente: atual.frente.slice(1), lugares: mru(lugar) });
    return;
  }
  visitar(lugar);
}

export function useHistoricoDaCasca() {
  const { atras, frente, lugares } = useSyncExternalStore(assinar, retrato, retrato);

  const voltar = useCallback((): Lugar | undefined => {
    if (atual.atras.length < 2) return undefined;
    const sai = atual.atras[atual.atras.length - 1];
    const vai = atual.atras[atual.atras.length - 2];
    publicar({ ...atual, atras: atual.atras.slice(0, -1), frente: [sai, ...atual.frente] });
    return vai;
  }, []);

  const avancar = useCallback((): Lugar | undefined => {
    const vai = atual.frente[0];
    if (!vai) return undefined;
    publicar({ ...atual, atras: atual.atras.concat(vai), frente: atual.frente.slice(1) });
    return vai;
  }, []);

  return {
    podeVoltar: atras.length > 1,
    podeAvancar: frente.length > 0,
    /** O lugar anterior, para o title dizer PARA ONDE o ← leva. */
    anterior: atras[atras.length - 2],
    proximo: frente[0],
    lugares,
    voltar,
    avancar,
  };
}

/** Atalhos de histórico: ⌘[ ⌘] andam na pilha, ⌘1…⌘4 levam aos lugares
 *  que o trilho mostra em "Onde eu estava" (a mesma lista, na mesma ordem).
 *  Separado do teclado da casca porque vale em qualquer tela. */
export function useAtalhosDeHistorico(
  navegar: (to: string) => void,
  atalhos: Lugar[] = [],
  /** R4: a casca já sabe se há overlay aberto — com um, nenhuma tecla é
   *  nossa. Este hook escutava o window direto e navegava por baixo do ⌘K. */
  bloqueado?: () => boolean,
) {
  const { voltar, avancar } = useHistoricoDaCasca();
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (bloqueado?.()) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      let destino: Lugar | undefined;
      if (e.key === '[') destino = voltar();
      else if (e.key === ']') destino = avancar();
      else if (/^[1-4]$/.test(e.key)) destino = atalhos[Number(e.key) - 1];
      if (!destino) return;
      // preventDefault também tira o Ctrl+1…4 do navegador (trocar de aba).
      e.preventDefault();
      navegar(destino.to);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [voltar, avancar, navegar, atalhos, bloqueado]);
}
