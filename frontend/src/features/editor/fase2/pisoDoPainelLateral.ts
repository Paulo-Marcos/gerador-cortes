import { useLayoutEffect, useState } from 'react';
import { getPanelGroupElement } from 'react-resizable-panels';

// ─────────────────────────────────────────────────────────────────
// D-1077 · O painel lateral da Pós não encolhe abaixo do rodapé das cenas.
//
// O react-resizable-panels só fala em porcentagem, e o mínimo era 22% do grupo.
// Em 1280 px com o trilho aberto o grupo tem ~780 px: 22% são 172 px. O botão
// "Validar o plano (faltam N)" não encolhe (o rótulo é vocabulário do produto)
// e a <section> do CenasPanel tem overflow-hidden — o fim do rótulo sumia.
//
// O piso é em px, convertido para a porcentagem do grupo a cada largura. O
// mínimo de antes (22%) continua valendo em tela larga, e o teto respeita o
// mínimo do vídeo e da timeline (40%).
// ─────────────────────────────────────────────────────────────────

/** O rodapé inteiro: Validar com dois dígitos (~188), 20 de padding, 16 de gap,
 *  bordas, e uma folga para o "Tipos disponíveis" não sumir de vez. */
export const PISO_DO_PAINEL_LATERAL_PX = 240;

const MINIMO_EM_PERCENTUAL = 22;
const MAXIMO_EM_PERCENTUAL = 60;

/** A porcentagem do grupo que dá o piso em px, dentro de [22, 60]. */
export function pisoEmPercentual(larguraDoGrupo: number): number {
  if (!(larguraDoGrupo > 0)) return MINIMO_EM_PERCENTUAL;
  const percentual = (PISO_DO_PAINEL_LATERAL_PX / larguraDoGrupo) * 100;
  return Math.min(MAXIMO_EM_PERCENTUAL, Math.max(MINIMO_EM_PERCENTUAL, percentual));
}

/** O `minSize` do painel lateral, medindo a largura do grupo `grupoId`. */
export function usePisoDoPainelLateral(grupoId: string): number {
  const [piso, setPiso] = useState(MINIMO_EM_PERCENTUAL);

  useLayoutEffect(() => {
    const grupo = getPanelGroupElement(grupoId);
    if (!grupo || typeof ResizeObserver === 'undefined') return;
    const medir = () => setPiso(pisoEmPercentual(grupo.getBoundingClientRect().width));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(grupo);
    return () => observador.disconnect();
  }, [grupoId]);

  return piso;
}
