// D-581: como a fila de Fires é filtrada e ordenada.
//
// A tela nasceu (D-458) como uma lista sem opinião: todo Fire, na ordem em que
// o corte foi atualizado. Funcionou enquanto eram cinco. Com dezenas, a
// pergunta que o operador faz ao abrir deixou de ser respondida — ele não quer
// "todos os Fires", quer "aquele em que eu estava trabalhando".
//
// Essas são perguntas diferentes, e a diferença tem nome no dado: `tem_edicao`
// (o backend soma os sinais que só existem se alguém agiu) separa o corte que a
// IA povoou do corte em que a mão humana passou.
//
// A regra mora aqui, e não num `useMemo` dentro da página, pela lição que a
// D-516 aprendeu na marra: regra de lista escondida em componente é regra que
// ninguém revisa — foi assim que a lista do TikTok herdou uma condição do
// YouTube e os cortes começaram a sumir dela.
import type { FireComBruto } from './shortsApi';

export type FiltroDeFire = 'todos' | 'editando' | 'novos' | 'prontos' | 'sem_bruto';

export interface OpcaoDeFiltro {
  id: FiltroDeFire;
  rotulo: string;
  /** O que ele responde, em uma linha — vira o `title` do chip. */
  nota: string;
}

export const FILTROS: readonly OpcaoDeFiltro[] = [
  { id: 'todos', rotulo: 'Todos', nota: 'Todos os cortes na fábrica de shorts' },
  {
    id: 'editando',
    rotulo: 'Estou mexendo',
    nota: 'Onde você já decidiu, marcou trecho, escreveu gancho ou mexeu no palco',
  },
  {
    id: 'novos',
    rotulo: 'Não comecei',
    nota: 'A IA propôs candidatos e ninguém passou por eles ainda',
  },
  { id: 'prontos', rotulo: 'Tem pronto', nota: 'Já existe pelo menos um MP4 final' },
  { id: 'sem_bruto', rotulo: 'Sem bruto', nota: 'O vídeo do bruto saiu do disco — precisa regerar' },
];

/**
 * O corte já recebeu trabalho humano?
 *
 * A resposta vem do backend (`tem_edicao`), mas há um degrau: um backend que
 * ainda não reiniciou não manda o campo. Nesse caso a curadoria visível nas
 * contagens é o melhor palpite — e é um palpite CONSERVADOR, que só erra para
 * menos (um corte onde só se escreveu ganchos aparece como não começado, nunca
 * o contrário). Errar para menos aqui é o lado certo: o filtro "não comecei"
 * mostrando algo já começado custa um clique; o inverso esconde trabalho.
 */
export function temEdicao(fire: FireComBruto): boolean {
  if (typeof fire.tem_edicao === 'boolean') return fire.tem_edicao;
  const { aprovado, rejeitado, renderizado } = fire.shorts;
  return aprovado + rejeitado + renderizado > 0;
}

/** Um Fire passa neste filtro? */
export function passaNoFiltro(fire: FireComBruto, filtro: FiltroDeFire): boolean {
  switch (filtro) {
    case 'editando':
      return temEdicao(fire);
    case 'novos':
      // Precisa TER candidatos: um corte sem nenhum não é "não comecei", é
      // "não tem o que fazer aqui" — e mandá-lo para esta aba faria o operador
      // abrir um corte vazio achando que ia curar.
      return fire.shorts.total > 0 && !temEdicao(fire);
    case 'prontos':
      return fire.shorts.renderizado > 0;
    case 'sem_bruto':
      return !fire.tem_bruto;
    default:
      return true;
  }
}

/** Quantos Fires cairiam em cada filtro — os números que vão nos chips. */
export function contarPorFiltro(fires: FireComBruto[]): Record<FiltroDeFire, number> {
  const zerado = Object.fromEntries(FILTROS.map((f) => [f.id, 0])) as Record<
    FiltroDeFire,
    number
  >;
  for (const fire of fires) {
    for (const { id } of FILTROS) {
      if (passaNoFiltro(fire, id)) zerado[id] += 1;
    }
  }
  return zerado;
}

/**
 * A busca por texto.
 *
 * Procura no título do corte, no da live e no tema. São os três jeitos de
 * lembrar de um corte — "aquele da inflação", "aquele da live de terça" — e
 * cobrir só um deles obrigaria a lembrar do jeito certo.
 */
export function combinaComBusca(fire: FireComBruto, termo: string): boolean {
  const busca = termo.trim().toLowerCase();
  if (!busca) return true;
  return [fire.titulo, fire.projeto_titulo, fire.tema_central]
    .join(' ')
    .toLowerCase()
    .includes(busca);
}

/** A fila visível: o filtro e a busca aplicados, nesta ordem. */
export function filtrarFires(
  fires: FireComBruto[],
  filtro: FiltroDeFire,
  busca: string,
): FireComBruto[] {
  return fires.filter((fire) => passaNoFiltro(fire, filtro) && combinaComBusca(fire, busca));
}

/**
 * Quanto da curadoria deste corte já andou, de 0 a 1.
 *
 * Serve à barra fina do card — o sinal que o olho pega antes de ler os números.
 * `rejeitado` conta como andado de propósito: rejeitar É decidir, e uma barra
 * que ignora o descarte diria que um corte todo revisado mal começou.
 */
export function progressoDaCuradoria(fire: FireComBruto): number {
  const { total, sugerido } = fire.shorts;
  if (total <= 0) return 0;
  return (total - sugerido) / total;
}
