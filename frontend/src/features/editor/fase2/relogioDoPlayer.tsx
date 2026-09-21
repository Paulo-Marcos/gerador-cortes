import { useSyncExternalStore, type ReactNode } from 'react';

/**
 * D-657: o tempo do player fora do estado da página.
 *
 * O `@remotion/player` avisa o frame 30 vezes por segundo. Esse número vivia
 * num `useState` da página de Pós e descia por props: cada frame re-renderizava
 * a página inteira, o `EditorFase2` e o próprio Player — 13 ms de um orçamento
 * de 33 ms, medidos num corte sem cenas nenhuma.
 *
 * Aqui o tempo é um relógio de parede: quem precisa olhar a hora a cada frame
 * (playhead, timecode) assina; quem só precisa dela num instante (um atalho,
 * um clique) pergunta `agora()` na hora e não re-renderiza por isso.
 */
export interface RelogioDoPlayer {
  agora(): number;
  marcar(t: number): void;
  assinar(ouvinte: () => void): () => void;
}

export function criarRelogioDoPlayer(inicial = 0): RelogioDoPlayer {
  let tempo = inicial;
  const ouvintes = new Set<() => void>();
  return {
    agora: () => tempo,
    marcar: (t) => {
      if (t === tempo) return;
      tempo = t;
      ouvintes.forEach((ouvinte) => ouvinte());
    },
    assinar: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

/**
 * O tempo atual, re-renderizando quem chama a cada mudança.
 *
 * Com `seletor`, só re-renderiza quando o RESULTADO muda — a cena ativa, por
 * exemplo, troca poucas vezes por minuto. O seletor precisa devolver um valor
 * comparável por `Object.is` (número, string, booleano); um objeto novo a cada
 * chamada faria o React re-renderizar sempre.
 */
export function useTempoDoPlayer(relogio: RelogioDoPlayer): number;
export function useTempoDoPlayer<T>(relogio: RelogioDoPlayer, seletor: (t: number) => T): T;
export function useTempoDoPlayer<T>(
  relogio: RelogioDoPlayer,
  seletor?: (t: number) => T,
): number | T {
  const ler = () => (seletor ? seletor(relogio.agora()) : relogio.agora());
  // O terceiro argumento é a leitura no render de servidor (e no dos testes).
  return useSyncExternalStore(relogio.assinar, ler, ler);
}

/**
 * Isola num nó pequeno quem precisa do tempo a cada frame.
 *
 * O componente que usa isto não re-renderiza com o relógio — só o que está
 * dentro do `children` roda de novo. É o que deixa a timeline andar a 30 Hz
 * sem arrastar o editor inteiro junto.
 */
export function ComTempoDoPlayer({
  relogio,
  children,
}: {
  relogio: RelogioDoPlayer;
  children: (t: number) => ReactNode;
}) {
  const t = useTempoDoPlayer(relogio);
  return <>{children(t)}</>;
}
