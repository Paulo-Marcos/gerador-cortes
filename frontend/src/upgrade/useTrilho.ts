import { useCallback, useState } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-869 · Modo foco (Onda 3, editor, nota 1).
//
// Nas telas da live o trilho recolhe para ícones sozinho: o player do
// editor e da Pós ganha ~150 px. A escolha manual vale até sair da live
// (decisão do Paulo, 05/10): abrir o trilho dentro de uma live o deixa
// aberto pelas telas DELA; ao sair e entrar de novo — ou passar para outra
// live — ele recolhe outra vez. Por isso a escolha da live não é gravada:
// gravada, um Ctrl+B para ler o menu desligava o modo foco para sempre, e
// quem recolhia o trilho fora o via ABRIR ao entrar (medido na pr-audit).
// Fora da live vale a preferência de sempre, na chave que já existia.
// ─────────────────────────────────────────────────────────────────

/** A chave que já existia: quem tinha recolhido o trilho não perde isso. */
export const TRILHO_FORA = 'upgrade-trilho';

type Escolha = 'expandido' | 'recolhido';

/** A visita a uma live: qual live, e se o trilho foi aberto nela. */
export type Visita = { live: string | null; aberto: boolean };

/** Mudou de live (ou saiu dela): a visita recomeça, com o trilho recolhido. */
export function visitaAtual(visita: Visita, live: string | null): Visita {
  return visita.live === live ? visita : { live, aberto: false };
}

/** Na live, o que a visita diz (recolhido até alguém abrir); fora, a escolha
 *  gravada — aberto por padrão, como sempre foi. */
export function trilhoExpandido(live: string | null, visita: Visita, fora?: Escolha): boolean {
  if (live) return visitaAtual(visita, live).aberto;
  return fora !== 'recolhido';
}

function ler(chave: string): Escolha | undefined {
  try {
    const v = window.localStorage.getItem(chave);
    return v === 'expandido' || v === 'recolhido' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** `live`: o id da live quando a tela é dela; `null` fora de uma live. */
export function useTrilho(live: string | null) {
  const [fora, setFora] = useState<Escolha | undefined>(() => ler(TRILHO_FORA));
  const [visita, setVisita] = useState<Visita>({ live, aberto: false });
  // Estado derivado da troca de live, ajustado no próprio render (o padrão
  // do React para "resetar quando a prop muda"), sem efeito e sem piscar.
  const atual = visitaAtual(visita, live);
  if (atual !== visita) setVisita(atual);
  const expandido = trilhoExpandido(live, atual, fora);

  const alternar = useCallback(() => {
    if (live) {
      setVisita({ live, aberto: !expandido });
      return;
    }
    const escolha: Escolha = expandido ? 'recolhido' : 'expandido';
    try {
      window.localStorage.setItem(TRILHO_FORA, escolha);
    } catch {
      // preferência some ao recarregar; não vale derrubar a casca por isso
    }
    setFora(escolha);
  }, [live, expandido]);

  return { expandido, alternar };
}
