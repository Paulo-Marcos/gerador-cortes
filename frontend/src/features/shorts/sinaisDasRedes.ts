// D-905: a regra dos ícones de rede no cartão do Fire, fora do JSX.
//
// O cartão responde "já dá para finalizar?" sem obrigar o operador a abrir o
// workspace e conferir short a short. O backend diz, por rede, se TODOS os
// shorts prontos do corte já subiram (`completa`); aqui isso vira o que a tela
// mostra — aceso ou apagado — e o que o tooltip conta.
import { REDES_DO_SHORT } from './centralProntos';
import type { FireComBruto } from './shortsApi';

export interface SinalDaRede {
  id: (typeof REDES_DO_SHORT)[number]['id'];
  rotulo: string;
  /** Aceso: todos os shorts prontos do corte já estão nesta rede. */
  ativa: boolean;
  titulo: string;
}

/** As três redes do short, sempre, na ordem da tela — apagadas quando falta alguém. */
export function sinaisDasRedes(fire: FireComBruto): SinalDaRede[] {
  const prontos = fire.shorts.renderizado;
  // Backend antigo, sem `redes`: nada acende — o mesmo degrau da `temEdicao`.
  const redes = Array.isArray(fire.redes) ? fire.redes : [];

  return REDES_DO_SHORT.map((rede) => {
    const dado = redes.find((r) => r.plataforma === rede.id);
    const ativa = dado?.completa ?? false;
    return {
      id: rede.id,
      rotulo: rede.rotulo,
      ativa,
      titulo: tituloDaRede(rede.rotulo, prontos, dado?.publicados ?? 0, ativa),
    };
  });
}

function tituloDaRede(rotulo: string, prontos: number, publicados: number, ativa: boolean): string {
  if (prontos === 0) return `Nenhum short pronto para subir no ${rotulo}`;
  if (ativa) {
    return prontos === 1
      ? `O short pronto já está no ${rotulo}`
      : `Os ${prontos} shorts prontos já estão no ${rotulo}`;
  }
  return `${publicados} de ${prontos} shorts prontos no ${rotulo}`;
}
