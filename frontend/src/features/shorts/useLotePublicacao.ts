// D-564: o estado do lote, do lado da tela.
//
// ## Por que polling, e não WebSocket
//
// O que a tela precisa saber muda em minutos, não em milissegundos: um upload
// de YouTube, um pacote montado, um clique seu no TikTok. Um socket a mais para
// isso seria mais canal para manter vivo do que informação para transportar.
//
// O intervalo é condicional de propósito: enquanto o lote corre, dois segundos;
// depois que ele termina, nada. Uma tela aberta a noite inteira não tem por que
// perguntar ao backend de dois em dois segundos sobre um lote que acabou.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shortsApi, type OpcoesDoLote } from './shortsApi';

export const LOTE_KEY = ['shorts', 'lote'] as const;

export function publicacoesKey(corteId: string) {
  return ['shorts', 'publicacoes', corteId] as const;
}

const INTERVALO_ATIVO_MS = 2000;

export function useLoteAtual() {
  return useQuery({
    queryKey: LOTE_KEY,
    queryFn: () => shortsApi.verLote(),
    refetchInterval: ({ state }) => {
      const lote = state.data?.lote;
      return lote && !lote.terminou ? INTERVALO_ATIVO_MS : false;
    },
  });
}

export function useCriarLote() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({
      alvos,
      plataformas,
      opcoes,
    }: {
      alvos: string[];
      plataformas: string[];
      opcoes: OpcoesDoLote;
    }) => shortsApi.criarLote(alvos, plataformas, opcoes),
    onSuccess: (lote) => {
      // O lote já volta montado na resposta: escrever direto no cache evita a
      // piscada de "nenhum lote" entre o POST e o primeiro GET.
      cliente.setQueryData(LOTE_KEY, { lote });
    },
  });
}

export function useCancelarLote() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => shortsApi.cancelarLote(),
    onSuccess: ({ lote }) => {
      // D-591: o lote já volta cancelado na resposta. Escrever direto no cache
      // faz a tela mudar no clique, e não dois segundos depois.
      if (lote) cliente.setQueryData(LOTE_KEY, { lote });
      cliente.invalidateQueries({ queryKey: LOTE_KEY });
    },
  });
}

/** O "publiquei" do destino manual — o backend não tem como ver o celular dele. */
export function useConfirmarPublicacao(corteId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ alvoId, plataforma }: { alvoId: string; plataforma: string }) =>
      shortsApi.confirmarPublicacao(alvoId, plataforma),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: LOTE_KEY });
      cliente.invalidateQueries({ queryKey: publicacoesKey(corteId) });
    },
  });
}

/** O que já foi publicado deste corte — a tela de seleção nasce sabendo. */
export function usePublicacoesDoCorte(corteId: string, habilitado = true) {
  return useQuery({
    queryKey: publicacoesKey(corteId),
    queryFn: () => shortsApi.publicacoesDoCorte(corteId),
    enabled: habilitado && Boolean(corteId),
    staleTime: 15_000,
  });
}
