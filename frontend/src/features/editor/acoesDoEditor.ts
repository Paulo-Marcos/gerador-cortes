import type { IconName } from '@/upgrade/Icon';
import type { ScreenAction } from '@/upgrade/ScreenHeader';
import type { ChromeBarra } from '@/upgrade/UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-870 · O topo do editor (Onda 3, nota 5 e plano do editor: "excluir
// fora do topo").
//
// "Gerar bruto" e "Excluir corte" eram dois botões soltos no topo, ao lado
// do título — o primeiro é trabalho pesado sobre o corte, o segundo é
// destrutivo. Vão para o "Mais" (⋯) do cabeçalho, com rótulo; o Excluir em
// vermelho e, como antes, com confirmação na tela. Desde a D-876 o Mais
// também serve às telas densas, como o editor.
// ─────────────────────────────────────────────────────────────────

export function acoesDoEditor(p: {
  brutoPronto: boolean;
  brutoOcupado: boolean;
  onGerarBruto?: () => void;
  onExcluir?: () => void;
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
    // D-746: excluir é trabalho sobre o corte, não veredito — longe do
    // Aprovar, e a tela pede confirmação antes.
    ...(p.onExcluir
      ? [{ icon: 'trash' as IconName, label: 'Excluir corte', danger: true, onClick: p.onExcluir }]
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
