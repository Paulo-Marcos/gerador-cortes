import { useCallback, useState } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-869 · Modo foco (Onda 3, editor, nota 1).
//
// Nas telas da live o trilho recolhe para ícones sozinho: o player do
// editor e da Pós ganha ~150 px. A escolha manual é respeitada — cada
// lugar lembra a sua. Abrir o trilho dentro da live vale para a live nas
// próximas visitas; recolher fora vale para fora, como sempre valeu. Uma
// escolha nunca desfaz a outra: quem gosta do trilho aberto na Biblioteca
// não o perde por ter entrado numa live.
// ─────────────────────────────────────────────────────────────────

/** A chave que já existia: quem tinha recolhido o trilho não perde isso. */
export const TRILHO_FORA = 'upgrade-trilho';
export const TRILHO_NA_LIVE = 'upgrade-trilho-live';

type Escolha = 'expandido' | 'recolhido';
type Escolhas = { fora?: Escolha; live?: Escolha };

/** Aberto ou recolhido: a escolha do lugar ou, sem ela, o padrão dele. */
export function trilhoExpandido(dentroDaLive: boolean, escolhas: Escolhas): boolean {
  const escolha = dentroDaLive ? escolhas.live : escolhas.fora;
  if (escolha) return escolha === 'expandido';
  return !dentroDaLive;
}

/** As escolhas depois de um clique: muda só a do lugar onde se está. */
export function comEscolha(escolhas: Escolhas, dentroDaLive: boolean, escolha: Escolha): Escolhas {
  return { ...escolhas, [dentroDaLive ? 'live' : 'fora']: escolha };
}

function ler(chave: string): Escolha | undefined {
  try {
    const v = window.localStorage.getItem(chave);
    return v === 'expandido' || v === 'recolhido' ? v : undefined;
  } catch {
    return undefined;
  }
}

export function useTrilho(dentroDaLive: boolean) {
  const [escolhas, setEscolhas] = useState<Escolhas>(() => ({
    fora: ler(TRILHO_FORA),
    live: ler(TRILHO_NA_LIVE),
  }));
  const expandido = trilhoExpandido(dentroDaLive, escolhas);

  const alternar = useCallback(() => {
    const escolha: Escolha = expandido ? 'recolhido' : 'expandido';
    try {
      window.localStorage.setItem(dentroDaLive ? TRILHO_NA_LIVE : TRILHO_FORA, escolha);
    } catch {
      // preferência some ao recarregar; não vale derrubar a casca por isso
    }
    setEscolhas((atual) => comEscolha(atual, dentroDaLive, escolha));
  }, [dentroDaLive, expandido]);

  return { expandido, alternar };
}
