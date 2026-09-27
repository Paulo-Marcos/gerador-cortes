// D-627: pré-requisitos da máquina (GET /sincronizacao/ambiente). Hook próprio
// para o cartão continuar "burro": ele só recebe o retrato pronto.
import { useQuery } from '@tanstack/react-query';
import { sincronizacaoApi } from '@/features/sincronizacao/api';
import type { Schema } from '@/shared/api';

export type Ambiente = Schema<'AmbienteResponse'>;
export type ItemAmbiente = Schema<'ItemDoAmbiente'>;
export type EstadoItem = ItemAmbiente['estado'];

export function useAmbiente() {
  return useQuery({
    queryKey: ['ambiente'],
    queryFn: sincronizacaoApi.ambiente,
    // A máquina não muda com a tela aberta; quem instalou algo clica em "Checar de novo".
    staleTime: Infinity,
    retry: false,
  });
}
