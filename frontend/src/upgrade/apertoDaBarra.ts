import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TRILHA_MIN_PX } from './medidas';
import type { ScreenAction } from './ScreenHeader';

// ─────────────────────────────────────────────────────────────────
// D-877 · Quem cede quando a barra superior aperta.
//
// Nas telas densas as ações da tela sobem para a barra, e a linha passava
// da largura: na Bancada a 1100 px, 1036 px de conteúdo em 888. A trilha ia
// a 0 px e fila, tema e busca ficavam fora da tela, sem como alcançar.
//
// A barra mede a si mesma e cede em degraus, nesta ordem (decidida com o
// Paulo em 04/10/2026):
//
//   0. tudo à vista (o seletor já tem teto: `SELETOR_MAX_PX`);
//   1. o subtítulo some;
//   2. o canal vira só o ícone;
//   3. as ações da tela vão para um "⋯ Mais".
//
// Fila, tema, busca (ícone) e o chip de estado nunca saem.
//
// Medir, e não usar limiares de janela, porque a conta muda com o título do
// corte, o trilho recolhido e quantas ações a tela tem: a mesma Bancada
// mediu 1161 px num corte e 1036 noutro.
// ─────────────────────────────────────────────────────────────────

export const NIVEL_MAX = 3;

/** O `minWidth` do espaçador da barra: abaixo disso não há folga. */
export const ESPACADOR_MIN_PX = 8;

/** O degrau atual e a largura da barra em que cada degrau foi cedido. */
export type Aperto = { nivel: number; cedeuEm: number[] };

export const SEM_APERTO: Aperto = { nivel: 0, cedeuEm: [] };

/** O que a barra mede para decidir. */
export type MedidaDaBarra = {
  /** Largura útil da barra. */
  largura: number;
  /** Espaço sobrando no espaçador flexível, acima do mínimo dele. */
  folga: number;
  /** Largura que a trilha conseguiu. */
  trilha: number;
  /** Quanto o conteúdo passa da barra. */
  transbordo: number;
};

/** Sem folga, com algo fora da barra ou a trilha espremida. Só a folga não
 *  basta: uma trilha curta ("Fila") cabe inteira com folga zero. */
export function estaApertada(m: Omit<MedidaDaBarra, 'largura'>): boolean {
  return m.folga <= 0 && (m.transbordo > 0 || m.trilha < TRILHA_MIN_PX);
}

/**
 * Um passo: apertada, cede o próximo degrau e anota a largura; mais larga do
 * que quando cedeu, devolve um. A anotação é a histerese — devolver no mesmo
 * pixel em que cedeu faria a barra piscar entre os dois degraus.
 */
export function proximoAperto(a: Aperto, m: MedidaDaBarra): Aperto {
  if (estaApertada(m)) {
    return a.nivel < NIVEL_MAX ? { nivel: a.nivel + 1, cedeuEm: [...a.cedeuEm, m.largura] } : a;
  }
  if (a.nivel > 0 && m.largura > a.cedeuEm[a.nivel - 1]) {
    return { nivel: a.nivel - 1, cedeuEm: a.cedeuEm.slice(0, -1) };
  }
  return a;
}

/** As peças que mudam com o degrau. */
export function pecasNoAperto(nivel: number) {
  return { subtitulo: nivel < 1, canalComTexto: nivel < 2, acoesNoMais: nivel >= 3 };
}

/**
 * Junta as ações simples num "⋯ Mais" (o menu da D-867). Ficam de fora a
 * ação forte (é a principal da tela), a de IA (o provedor é escolhido no
 * próprio botão) e um menu que já exista. Com menos de duas simples não
 * junta: trocar um botão por um "Mais" esconde sem devolver espaço.
 */
export function juntarNoMais(acoes: ScreenAction[]): ScreenAction[] {
  const simples = acoes.filter((a) => !a.forte && !a.ia && !a.menu);
  if (simples.length < 2) return acoes;
  return [
    ...acoes.filter((a) => !simples.includes(a)),
    {
      icone: 'more-horizontal',
      texto: 'Mais',
      menu: simples.map((a) => ({ icon: a.icone, label: a.texto, onClick: a.onClick })),
    },
  ];
}

/**
 * Mede a barra quando o degrau, a largura ou o conteúdo mudam. `chave` é o
 * conteúdo que ocupa a linha (textos da trilha, das ações, do canal…): mudou,
 * a conta recomeça do zero, senão a barra seguiria apertada numa tela que
 * nem tem ações.
 */
export function useApertoDaBarra(chave: string) {
  const barra = useRef<HTMLElement>(null);
  const trilha = useRef<HTMLElement>(null);
  const espacador = useRef<HTMLDivElement>(null);
  const [aperto, setAperto] = useState(SEM_APERTO);
  const [chaveVista, setChaveVista] = useState(chave);
  const [largura, setLargura] = useState(0);

  if (chave !== chaveVista) {
    setChaveVista(chave);
    setAperto(SEM_APERTO);
  }

  // Antes de pintar: cada degrau cedido re-renderiza e mede de novo, e a
  // pessoa só vê o degrau final.
  useLayoutEffect(() => {
    const b = barra.current;
    if (!b || !trilha.current || !espacador.current) return;
    const medida = {
      largura: b.clientWidth,
      folga: espacador.current.offsetWidth - ESPACADOR_MIN_PX,
      trilha: trilha.current.offsetWidth,
      transbordo: b.scrollWidth - b.clientWidth,
    };
    setAperto((a) => proximoAperto(a, medida));
  }, [aperto, largura, chave]);

  useEffect(() => {
    const b = barra.current;
    if (!b || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => setLargura(b.clientWidth));
    observador.observe(b);
    return () => observador.disconnect();
  }, []);

  return { barra, trilha, espacador, nivel: aperto.nivel };
}
