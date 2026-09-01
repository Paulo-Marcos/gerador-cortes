import type { PreviaLimpezaResponse } from '@/types/models';

// D-457: a segunda pergunta da limpeza.
//
// O bruto do corte Fire deixou de ser sobra do render e virou a matéria-prima
// da fábrica de shorts: sem ele não dá para gerar short daquele corte, e
// refazê-lo exige re-extrair o trecho da live inteira. Por isso a limpeza
// pergunta antes — mas só quando há o que perguntar. Um diálogo a mais numa
// live sem Fire é ruído, e ruído treina o operador a clicar sem ler.

/** A pergunta a fazer antes de limpar, ou `null` quando não há nada a perguntar. */
export function perguntaBrutosFire(previa: PreviaLimpezaResponse | null): string | null {
  if (!previa || previa.brutos_fire <= 0) return null;

  const plural = previa.brutos_fire === 1 ? 'bruto' : 'brutos';
  return (
    `Esta live tem ${previa.brutos_fire} ${plural} de corte Fire ocupando ${previa.retido_mb} MB.\n\n` +
    'Eles sao a materia-prima dos shorts — sem eles nao da para gerar short desses cortes.\n\n' +
    'OK = limpar tambem os brutos dos Fires\nCancelar = manter os brutos (recomendado)'
  );
}
