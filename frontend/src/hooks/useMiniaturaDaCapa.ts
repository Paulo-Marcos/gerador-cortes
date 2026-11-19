// D-1131 (E-069 H-11c) · A miniatura da capa pelo TanStack Query: uma busca por capa, para
// sempre na aba (a capa é regravada no mesmo arquivo, mas a aurora não precisa acompanhar).
// Vários componentes pedindo a mesma capa dividem a mesma busca; nada de chamada solta.
import { useQuery } from '@tanstack/react-query';
import { miniaturaDaCapa } from '@/lib/miniaturaDaCapa';

export function consultaDaMiniatura(urlDaCapa: string | null | undefined) {
  return {
    queryKey: ['miniatura-da-capa', urlDaCapa] as const,
    queryFn: () => miniaturaDaCapa(urlDaCapa as string),
    enabled: Boolean(urlDaCapa),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  };
}

export function useMiniaturaDaCapa(urlDaCapa: string | null | undefined): string | null {
  const consulta = useQuery(consultaDaMiniatura(urlDaCapa));
  return urlDaCapa ? (consulta.data ?? null) : null;
}
