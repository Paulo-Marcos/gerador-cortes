import type { IconName } from '@/upgrade/Icon';
import type { ScreenAction } from '@/upgrade/ScreenHeader';

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
