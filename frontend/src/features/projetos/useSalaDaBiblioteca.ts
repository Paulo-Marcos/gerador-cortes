import { useQuery } from '@tanstack/react-query';
import { cortesApi } from '@/features/editor/api/cortes';
import { api, dados } from '@/shared/api';
import { cortesProjetoKey } from '@/shared/chavesDeCache';

// D-1148 (E-069 H-15) · Os dois dados da Biblioteca que não vêm da listagem.

/** A leitura do nome do operador (D-1129, `GET /api/operador`). */
export const consultaDoOperador = {
  queryKey: ['operador'] as const,
  queryFn: () => dados(api.GET('/api/operador')),
};

/** O nome do operador: "" quando ele ainda não disse (ou a rota falhou) — a saudação sai sem nome. */
export function useNomeDoOperador(): string {
  const { data } = useQuery({ ...consultaDoOperador, staleTime: 5 * 60_000 });
  return data?.nome ?? '';
}

/** Os cortes da live do "Continue", para o mini-mapa. Mesma chave do editor: abrir a
 *  live depois não busca de novo. */
export function useCortesDoDestaque(projetoId: string | undefined) {
  return useQuery({
    queryKey: cortesProjetoKey(projetoId ?? ''),
    queryFn: () => cortesApi.listarCortes(projetoId!),
    enabled: Boolean(projetoId),
    staleTime: 5_000,
  });
}
