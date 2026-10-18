import { useEffect, useRef, type RefObject } from 'react';

/**
 * O Esc nasceu dentro de outro modal aberto DENTRO desta caixa (a capa ampliada
 * do modal de metadados): a tecla é dele. Ouvido na captura, o Esc fechava a
 * caixa inteira, e reabrir perdia a capa nova (D-968). Lê quem recebeu a tecla,
 * e não a caixa: o modal de dentro tem o foco desde que abre.
 */
export function escDeOutroModal(alvo: EventTarget | null, caixa: HTMLElement | null) {
  const dialogo = (alvo as Element | null)?.closest?.('[role="dialog"][aria-modal="true"]');
  return Boolean(dialogo && caixa && dialogo !== caixa && caixa.contains(dialogo));
}

/** Ao abrir, o foco vai para o primeiro botão da caixa; Esc fecha; ao fechar,
 *  o foco volta para quem abriu. */
export function useFocoDoModal(caixa: RefObject<HTMLElement | null>, aoFechar: () => void) {
  // D-967: o pai entrega `aoFechar` como função nova a cada render. Se o efeito
  // dependesse dela, cada render do pai (refetch, polling) devolveria o foco ao
  // gatilho e o poria no 1º botão — e quem digitava o título perdia o campo.
  // O Esc lê a versão mais recente por esta ref (como no Modal de components/ui);
  // o efeito do foco roda só na abertura.
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const gatilho = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>('button')?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escDeOutroModal(e.target, caixa.current)) return;
      // Para aqui: sem isso o Esc segue e fecha o que estiver atrás.
      e.stopPropagation();
      fechar.current();
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      gatilho?.focus?.();
    };
  }, [caixa]);
}
