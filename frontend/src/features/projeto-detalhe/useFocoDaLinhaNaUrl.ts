import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

// A chegada que já levou o foco. Fora do componente porque a linha remonta: a busca a tira
// da lista e a devolve, com o `?corte=` ainda na URL e o operador digitando.
let ultimaChegada: string | null = null;

/**
 * D-1051: quem volta do Fire chega à live pela linha do corte (`?corte=`), e numa lista
 * longa ela podia estar fora da tela. Com o foco nela, A, R e as setas já valem.
 * Uma vez por chegada: com o foco de volta no meio da digitação, a letra seguinte
 * cairia na linha, e "A" desfaz a aprovação sem confirmar.
 */
export function useFocoDaLinhaNaUrl(corteId: string) {
  const { key: chegada } = useLocation();
  const [parametros] = useSearchParams();
  const eAlvo = parametros.get('corte') === corteId;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!eAlvo || ultimaChegada === chegada) return;
    ultimaChegada = chegada;
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [eAlvo, chegada]);
  return ref;
}
