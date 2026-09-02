import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shortsApi } from './shortsApi';
import { FIRES_KEY } from './useFires';

// D-472: o caminho MANUAL da fabrica de shorts, disparado da tela do bruto.
//
// Existe para os cortes que o automatico nao alcanca: os que ja tinham bruto
// antes da E-030, os que tiveram o bruto descartado, e o teste da esteira sem
// reprocessar a live inteira.

export const elegibilidadeKey = (corteId: string) =>
  ['shorts', 'elegibilidade', corteId] as const;

export function useElegibilidadeShorts(corteId: string) {
  return useQuery({
    queryKey: elegibilidadeKey(corteId),
    queryFn: () => shortsApi.elegibilidade(corteId),
    enabled: Boolean(corteId),
    // O Fire e o bruto mudam por acao do operador noutra tela; recarregar ao
    // focar a janela evita o botao prometer o que nao existe mais.
    refetchOnWindowFocus: true,
  });
}

export function useGerarShortsManualmente(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => shortsApi.gerarManualmente(corteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: elegibilidadeKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
    },
  });
}

// D-502: indicar o corte poe SO ELE na fabrica, sem mexer no Fire — que e um
// julgamento sobre o corte inteiro, nao sobre um trecho dele.
export function useIndicarParaShorts(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (indicado: boolean) => shortsApi.indicarParaShorts(corteId, indicado),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: elegibilidadeKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
    },
  });
}
