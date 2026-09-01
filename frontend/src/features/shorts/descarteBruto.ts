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
