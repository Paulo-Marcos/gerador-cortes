import { useEffect, useRef, type RefObject } from 'react';

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
      if (e.key !== 'Escape') return;
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
