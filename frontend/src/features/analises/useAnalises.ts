// E-022: camada de I/O (react-query) da Área de Análises. Mantém as abas
// "burras" — os componentes só consomem estes hooks, sem tocar em fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type LevantamentoDuracao,
  type LevantamentoTitulo,
  type TelemetriaProjeto,
  type YoutubeStatsStatus,
  type YoutubeStatsSyncResult,
} from '@/lib/api';
import type { Projeto } from '@/types/models';

const PROJETOS_KEY = ['analises', 'projetos'] as const;
const YT_STATUS_KEY = ['analises', 'youtube-status'] as const;
const YT_DURACAO_KEY = ['analises', 'youtube-duracao-retencao'] as const;
const YT_TITULO_KEY = ['analises', 'youtube-titulo-desempenho'] as const;
const telemetriaKey = (projetoId: string | null) => ['analises', 'telemetria', projetoId] as const;

/** Lista de projetos para o seletor da aba Proposta × Final. */
export function useProjetosAnalises() {
  return useQuery<Projeto[]>({
    queryKey: PROJETOS_KEY,
    queryFn: api.listarProjetos,
    staleTime: 30_000,
  });
}

/** Telemetria proposta×final de UM projeto (desabilitada sem seleção). */
export function useTelemetriaCortes(projetoId: string | null) {
  return useQuery<TelemetriaProjeto>({
    queryKey: telemetriaKey(projetoId),
    queryFn: () => api.obterTelemetriaCortes(projetoId as string),
    enabled: !!projetoId,
  });
}

/** Status do último sync do YouTube + lista de vídeos. */
export function useYoutubeStatsStatus() {
  return useQuery<YoutubeStatsStatus>({
    queryKey: YT_STATUS_KEY,
    queryFn: api.obterYoutubeStatsStatus,
    staleTime: 30_000,
  });
}

export function useLevantamentoDuracao() {
  return useQuery<LevantamentoDuracao[]>({
    queryKey: YT_DURACAO_KEY,
    queryFn: async () => (await api.levantamentoDuracaoRetencao()).faixas,
    staleTime: 30_000,
  });
}

export function useLevantamentoTitulo() {
  return useQuery<LevantamentoTitulo[]>({
    queryKey: YT_TITULO_KEY,
    queryFn: async () => (await api.levantamentoTituloDesempenho()).grupos,
    staleTime: 30_000,
  });
}

/**
 * Dispara o sync. Só invalida os levantamentos quando o backend aceitou o
 * disparo (status !== 'erro') — sync com token/escopo faltando não muda dados.
 */
export function useSincronizarYoutube() {
  const qc = useQueryClient();
  return useMutation<YoutubeStatsSyncResult>({
    mutationFn: api.sincronizarYoutubeStats,
    onSuccess: (resultado) => {
      if (resultado.status !== 'erro') {
        qc.invalidateQueries({ queryKey: YT_STATUS_KEY });
        qc.invalidateQueries({ queryKey: YT_DURACAO_KEY });
        qc.invalidateQueries({ queryKey: YT_TITULO_KEY });
      }
    },
  });
}
