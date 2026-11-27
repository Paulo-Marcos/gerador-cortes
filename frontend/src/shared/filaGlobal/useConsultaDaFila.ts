import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { SEM_BACKEND, mensagemErro } from '@/lib/mensagemErro';
import { filaGlobalApi } from './api';

// A consulta do inventário da fila (D-417) e a situação dela para a tela (D-1204).

const POLL_ATIVO_MS = 2_000;
const POLL_OCIOSO_MS = 5_000;

/**
 * Falha e carregando saem dos carimbos, não do `isError`: sem dado nenhum, o TanStack v5 volta a
 * "pending" a cada volta do relógio, e a tela piscaria entre o erro e "Nada na fila".
 */
export function situacaoDaFila(consulta: {
  error: unknown;
  errorUpdatedAt: number;
  dataUpdatedAt: number;
}): { falha: string | null; carregando: boolean } {
  const falhou = consulta.errorUpdatedAt > consulta.dataUpdatedAt;
  return {
    falha: falhou ? mensagemErro(consulta.error, SEM_BACKEND) : null,
    carregando: !falhou && consulta.dataUpdatedAt === 0,
  };
}

export interface SituacaoDaFila {
  /** D-1204: a frase da falha da consulta; `null` quando está em dia. */
  falha: string | null;
  carregando: boolean;
  tentarDeNovo: () => void;
}

export function useSituacaoDaFila(
  consulta: Parameters<typeof situacaoDaFila>[0] & { refetch: () => unknown },
): SituacaoDaFila {
  const { falha, carregando } = situacaoDaFila(consulta);
  const { refetch } = consulta;
  const tentarDeNovo = useCallback(() => void refetch(), [refetch]);
  return useMemo(() => ({ falha, carregando, tentarDeNovo }), [falha, carregando, tentarDeNovo]);
}

export function useConsultaDaFila<Remoto>(temAtivo: boolean) {
  return useQuery({
    queryKey: ['workbench', 'fila-global'],
    // O contrato estendido (`jobs`) só é consumido pela fila — daí o cast local.
    queryFn: async () => (await filaGlobalApi.filaGlobal()) as unknown as { jobs?: Remoto[] },
    refetchInterval: temAtivo ? POLL_ATIVO_MS : POLL_OCIOSO_MS,
  });
}
