import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * D-1051: quem volta do Fire chega à live pela linha do corte (`?corte=`), e numa lista
 * longa ela podia estar fora da tela. Com o foco nela, A, R e as setas já valem.
 * Roda ao montar, e não a cada releitura da lista: refetch não pode roubar o foco.
 */
export function useFocoDaLinhaNaUrl(corteId: string) {
  const [parametros] = useSearchParams();
  const eAlvo = parametros.get('corte') === corteId;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!eAlvo) return;
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [eAlvo]);
  return ref;
}
