import type { ContagemShorts } from './shortsApi';

// D-460: o aviso antes de liberar o disco do bruto de um Fire.
//
// A frase é o produto desta demanda tanto quanto o botão. Descartar o bruto não
// é "limpar arquivo": é encerrar a fábrica de shorts daquele corte, e refazê-lo
// exige re-extrair o trecho da live inteira. O texto tem de dizer isso na cara,
// e dizer quantos MB estão em jogo — senão o operador decide no escuro.

export function avisoDescarteBruto(titulo: string, brutoMb: number): string {
  return (
    `Descartar o bruto de "${titulo}" e liberar ${brutoMb} MB?\n\n` +
    'Sem o bruto este corte nao gera mais nenhum short, e os candidatos que ja\n' +
    'existem deixam de poder ser renderizados.\n\n' +
    'Refazer o bruto exige re-extrair o trecho da live inteira.'
  );
}

/** Um Fire com todos os candidatos rejeitados já está resolvido: nada restou para publicar. */
export function todosOsShortsForamRejeitados(
  shorts: Pick<ContagemShorts, 'total' | 'rejeitado'>,
): boolean {
  return shorts.total > 0 && shorts.rejeitado === shorts.total;
}

/**
 * O item do menu diz o que a ação FAZ: descartar o bruto. Ela não marca o Fire
 * como rejeitado — só libera o disco. Quando todos os candidatos já foram
 * rejeitados, o rótulo lembra que é a hora natural de descartar.
 */
export function rotuloDescarteBruto(
  shorts: Pick<ContagemShorts, 'total' | 'rejeitado'>,
  brutoMb: number,
): string {
  const acao = `Descartar o bruto (${brutoMb} MB)`;
  return todosOsShortsForamRejeitados(shorts) ? `${acao}: nenhum candidato restou` : acao;
}
