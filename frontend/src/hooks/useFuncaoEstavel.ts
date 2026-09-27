import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Uma função de identidade fixa que sempre chama a versão ATUAL de `fn`.
 *
 * Serve para passar handlers a filhos memorizados: a identidade não muda a
 * cada render (o memo segura), e o valor chamado nunca é o de uma render
 * antiga. É o padrão "latest ref"; o useEffectEvent do React faz o mesmo, mas
 * só pode ser chamado de dentro de efeitos (D-740).
 */
export function useFuncaoEstavel<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const atual = useRef(fn);
  useLayoutEffect(() => {
    atual.current = fn;
  });
  return useCallback((...args: A) => atual.current(...args), []);
}
