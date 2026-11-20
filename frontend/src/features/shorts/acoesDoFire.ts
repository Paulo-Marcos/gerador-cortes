// D-1168 (E-069 H-20; DIRECAO §5 e §7.6) · O "⋯" da linha do Fire, como dado.
//
// A linha tem UMA ação de texto ("Abrir workspace"); o resto mora aqui. Fica fora do JSX para
// o teste ler os rótulos e as dicas sem abrir o menu: o `renderToStaticMarkup` só vê o gatilho.
//
// "Finalizar" é a declaração da RN-17 (os shorts já estão nas redes) e é reversível no mesmo
// lugar, por isso não pede confirmação. "Gerar shorts com IA" é o gesto da D-803.
import type { OverflowMenuItem } from '@/components/ui/overflow-menu';
import { dicaDeGerar, rotuloDeGerar, semDeOndeRecortar } from './GerarComIa';
import { estaFinalizado } from './filtrosDosFires';
import type { FireComBruto } from './shortsApi';

export interface AcoesDoFire {
  editar: () => void;
  alternarFinalizado: () => void;
  gerar: () => void;
  /** A live deste corte está sendo gerada em lote: gerar um corte agora duplicaria o trabalho. */
  liveRodando: boolean;
  /** A marcação de finalizado está em voo. */
  marcando: boolean;
}

export const DICA_DO_WORKSPACE_VAZIO = 'Ainda não há short renderizado neste corte';
export const DICA_DO_WORKSPACE = 'Os shorts prontos deste corte, com publicação em massa';

export function dicaDoWorkspace(fire: FireComBruto): string {
  return fire.shorts.renderizado > 0 ? DICA_DO_WORKSPACE : DICA_DO_WORKSPACE_VAZIO;
}

export function itensDoMenuDoFire(fire: FireComBruto, a: AcoesDoFire): OverflowMenuItem[] {
  const finalizado = estaFinalizado(fire);
  const itens: OverflowMenuItem[] = [
    { icon: 'pen', label: 'Editar a curadoria', onClick: a.editar },
    {
      icon: finalizado ? 'rotate-ccw' : 'check-check',
      label: finalizado ? 'Reabrir' : 'Finalizar',
      title: finalizado
        ? 'Devolver este corte para a fila de trabalho'
        : 'Os shorts deste corte já subiram para YouTube, TikTok e Instagram: tirar da fila',
      disabled: a.marcando,
      onClick: a.alternarFinalizado,
    },
  ];
  // D-593: corte finalizado não pede mais nada; o convite seria ruído.
  if (!finalizado) {
    const semFonte = semDeOndeRecortar(fire);
    itens.push({
      icon: 'sparkle',
      label: rotuloDeGerar(fire),
      title: semFonte ? 'Sem bruto e com a live limpa: use “Baixar a live e gerar” na faixa da live' : dicaDeGerar(fire),
      disabled: a.liveRodando || semFonte,
      onClick: a.gerar,
    });
  }
  return itens;
}
