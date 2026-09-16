// D-611: a central de prontos, do lado da tela.
import { useQuery } from '@tanstack/react-query';
import { shortsApi } from './shortsApi';

export const PRONTOS_KEY = ['shorts', 'prontos'] as const;

export function useShortsProntos() {
  return useQuery({
    queryKey: PRONTOS_KEY,
    queryFn: () => shortsApi.listarProntos(),
    staleTime: 15_000,
  });
}
