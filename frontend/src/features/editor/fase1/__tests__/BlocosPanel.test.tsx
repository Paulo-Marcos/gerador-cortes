import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BlocosPanel } from '../BlocosPanel';
import type { ArranjoBlocos, BlocoArranjo } from '@/types/models';

const noop = vi.fn();

function bloco(posicao: number, inicio: number, fim: number, liquida = fim - inicio): BlocoArranjo {
  return {
    posicao,
    inicio_seg: inicio,
    fim_seg: fim,
    duracao_seg: fim - inicio,
    duracao_liquida_seg: liquida,
  };
}

function arranjo(blocos: BlocoArranjo[], extras: Partial<ArranjoBlocos> = {}): ArranjoBlocos {
  return {
    corte_id: 'c1',
    inicio_seg: 0,
    fim_seg: 480,
    blocos,
    cronologico: true,
    bruto_desatualizado: false,
    ...extras,
  };
}

function render(dados: ArranjoBlocos | undefined, pontoSeg = 200) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <BlocosPanel
        arranjo={dados}
        pontoSeg={pontoSeg}
        onSeek={noop}
        onDividir={noop}
        onMover={noop}
        onFundir={noop}
        onRestaurar={noop}
      />
    </TooltipProvider>,
  );
}

/**
 * O `<button>` que contém "Dividir aqui" está desabilitado?
 *
 * O rótulo do tooltip não serve de sonda: o Radix só monta o conteúdo quando o
 * tooltip abre, então ele nunca aparece no HTML estático.
 */
function botaoDividirDesabilitado(html: string): boolean {
  const fim = html.indexOf('Dividir aqui');
  const inicio = html.lastIndexOf('<button', fim);
  // `disabled=""` (o atributo), e não a substring "disabled" — as classes
  // utilitárias do botão trazem `disabled:opacity-50` e dariam falso positivo.
  return html.slice(inicio, fim).includes('disabled=""');
}

// [A 0-180][B 180-300][C 300-480] com C jogado para o começo.
const REORDENADO = arranjo(
  [bloco(0, 300, 480), bloco(1, 0, 180), bloco(2, 180, 300)],
  { cronologico: false },
);

describe('BlocosPanel', () => {
  it('convida a dividir quando o corte ainda e um bloco so', () => {
    const html = render(arranjo([bloco(0, 0, 480)]));
    expect(html).toContain('Dividir aqui');
    expect(html).toContain('O corte é um bloco só');
  });

  it('rotula o bloco pela origem na live, e nao pela posicao na fila', () => {
    // C toca primeiro, mas continua sendo C: o rótulo é a identidade do
    // material, não o lugar dele. Trocar isso faria o editor perder a
    // referência justamente quando mais precisa dela — depois de mover.
    const html = render(REORDENADO);
    const ordemDosRotulos = ['C', 'A', 'B'].map((r) => html.indexOf(`>${r}</span>`));

    expect(ordemDosRotulos.every((i) => i > -1)).toBe(true);
    expect([...ordemDosRotulos].sort((x, y) => x - y)).toEqual(ordemDosRotulos);
  });

  it('mostra a duracao liquida e a bruta quando o bloco tem trecho removido', () => {
    const html = render(arranjo([bloco(0, 0, 180, 130)]));
    expect(html).toContain('02:10'); // 130s: o que aparece no video
    expect(html).toContain('de 03:00'); // 180s: o span na live
  });

  it('oferece voltar a ordem da live somente quando ela foi alterada', () => {
    expect(render(REORDENADO)).toContain('Ordem da live');
    expect(render(arranjo([bloco(0, 0, 480)]))).not.toContain('Ordem da live');
  });

  it('avisa que o bruto ficou velho sem falar em apagar nada', () => {
    const html = render(arranjo([bloco(0, 0, 480)], { bruto_desatualizado: true }));
    expect(html).toContain('o bruto gerado ainda está na ordem antiga');
  });

  it('desabilita dividir quando o ponteiro esta colado na borda de um bloco', () => {
    // A lâmina na junta não teria o que cortar: dividiria um bloco em ele mesmo
    // mais um pedaço de zero. Melhor desabilitar do que aceitar e não fazer nada.
    const dois = arranjo([bloco(0, 0, 180), bloco(1, 180, 480)]);

    expect(botaoDividirDesabilitado(render(dois, 180))).toBe(true);
    expect(botaoDividirDesabilitado(render(dois, 250))).toBe(false);
  });

  it('sempre oferece as setas, e nao so o arrasto (WCAG 2.5.7)', () => {
    const html = render(REORDENADO);
    expect(html).toContain('aria-label="Mover para cima"');
    expect(html).toContain('aria-label="Mover para baixo"');
  });
});
