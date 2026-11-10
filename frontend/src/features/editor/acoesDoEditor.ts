import type { IconName } from '@/upgrade/Icon';
import type { ScreenAction } from '@/upgrade/ScreenHeader';
import type { ChromeBarra } from '@/upgrade/UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-870 · O topo do editor (Onda 3, nota 5 e plano do editor: "excluir
// fora do topo").
//
// "Gerar bruto" era um botão solto no topo, ao lado do título: trabalho
// pesado sobre o corte. Vai para o "Mais" (⋯) do cabeçalho, com rótulo. Desde
// a D-876 o Mais também serve às telas densas, como o editor. D-1088: o
// "Excluir corte" saiu do Mais e do app; riscar, na barra de baixo, é a exclusão.
// ─────────────────────────────────────────────────────────────────

export function acoesDoEditor(p: {
  brutoPronto: boolean;
  brutoOcupado: boolean;
  onGerarBruto?: () => void;
}): ScreenAction[] {
  const itens = [
    ...(p.onGerarBruto
      ? [
          {
            icon: (p.brutoOcupado ? 'loader' : 'scissors') as IconName,
            label: p.brutoPronto ? 'Regerar bruto' : 'Gerar bruto',
            onClick: p.onGerarBruto,
          },
        ]
      : []),
  ];
  return itens.length > 0 ? [{ icone: 'more-horizontal', texto: 'Mais', menu: itens }] : [];
}

/**
 * D-1041: corte aprovado não tem mais o que aprovar. O principal dizia
 * "Aprovado", e o clique ou o Enter o devolviam a proposto. O veredito vira o
 * par reversível da Pós, e o principal passa a ser o próximo passo: gerar o
 * bruto ou seguir para a Pós. Gerar é trabalho pesado, então o Enter não dispara.
 * Corte ainda não aprovado fica com o "Aprovar corte" padrão da bancada.
 */
export function montarBarraDoEditor(p: {
  aprovado: boolean;
  brutoPronto: boolean;
  brutoOcupado: boolean;
  salvando: boolean;
  /** D-1044: os trechos mudaram depois do bruto; seguir levaria o vídeo antigo à Pós. */
  brutoDefasado?: boolean;
  onAlternarVeredito: () => void;
  onGerarBruto: () => void;
  onIrParaPos: () => void;
}): Partial<ChromeBarra> {
  if (!p.aprovado) return {};
  const veredito = { aprovado: true, ocupado: p.salvando, onAlternar: p.onAlternarVeredito };
  if (p.brutoOcupado) {
    return {
      veredito,
      primario: { texto: 'Gerando bruto…', icone: 'loader', onClick: p.onGerarBruto, desabilitado: true },
    };
  }
  if (p.brutoDefasado) {
    return {
      veredito,
      primario: { texto: 'Regerar bruto', icone: 'scissors', onClick: p.onGerarBruto, semEnter: true },
    };
  }
  return {
    veredito,
    primario: p.brutoPronto
      ? { texto: 'Ir para a Pós', icone: 'arrow-right', onClick: p.onIrParaPos }
      : { texto: 'Gerar bruto', icone: 'scissors', onClick: p.onGerarBruto, semEnter: true },
  };
}
