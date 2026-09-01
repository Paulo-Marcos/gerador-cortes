import { useQuery } from '@tanstack/react-query';
import { shortsApi } from './shortsApi';

export const FIRES_KEY = ['shorts', 'fires'] as const;

// D-458: a lista é deliberadamente assíncrona ao pipeline — os candidatos nascem
// na geração do bruto e a curadoria acontece quando o operador quiser. Por isso
// não há refetch agressivo aqui: nada muda enquanto a tela está aberta, a menos
// que outra aba gere um bruto.
export function useFires() {
  return useQuery({
    queryKey: FIRES_KEY,
    queryFn: () => shortsApi.listarFires(),
    staleTime: 30_000,
  });
}
