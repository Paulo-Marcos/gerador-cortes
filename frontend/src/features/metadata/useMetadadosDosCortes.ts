import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { Corte, MetadadoCorte } from '@/types/models';
import { metadadosApi } from './api/metadados';
import { metadataKey } from './useMetadataCard';

const porCorte = (leituras: UseQueryResult<MetadadoCorte>[]): Record<string, MetadadoCorte> =>
  Object.fromEntries(leituras.flatMap(({ data }) => (data ? [[data.corte_id, data]] : [])));

/**
 * D-1174: o metadado de cada corte da lista. O status de exportação não traz o texto nem o prompt
 * da capa, que fazem o "parcial"; a leitura é a mesma do card, na mesma chave, então o corte aberto
 * não é lido duas vezes e o que ele grava aparece na lista. `porCorte` fica fora do hook: com a
 * função estável o resultado só muda quando um metadado muda, e a casca não é redefinida à toa.
 */
export function useMetadadosDosCortes(cortes: Corte[]): Record<string, MetadadoCorte> {
  return useQueries({
    queries: cortes.map((corte) => ({
      queryKey: metadataKey(corte.id),
      queryFn: () => metadadosApi.obterMetadado(corte.id),
    })),
    combine: porCorte,
  });
}
