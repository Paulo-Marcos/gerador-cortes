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
import { useEffect, useRef } from 'react';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loteApi, type OpcoesDoLote } from './loteApi';
import { shortsApi } from './shortsApi';
import { FIRES_KEY } from './useFires';
import { usePublicarShort } from './useShortsDoCorte';
import { PRONTOS_KEY } from './useShortsProntos';

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
    }) => loteApi.criar(alvos, plataformas, opcoes),
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

/**
 * O "publiquei" do destino manual — o backend não tem como ver o celular dele.
 *
 * D-603: vale também para o item que falhou e foi terminado à mão no app da
 * rede. É uma DECLARAÇÃO do operador, e por isso ela pode nascer sem lote.
 */
export function useConfirmarPublicacao(corteId?: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({
      alvoId,
      plataforma,
      url,
    }: {
      alvoId: string;
      plataforma: string;
      url?: string;
    }) => shortsApi.confirmarPublicacao(alvoId, plataforma, url ?? ''),
    onSuccess: () => atualizarDepoisDoPubliquei(cliente, corteId),
  });
}

/** Tudo o que mostra onde o vídeo está, refrescado depois de um "publiquei". */
export function atualizarDepoisDoPubliquei(cliente: QueryClient, corteId?: string) {
  cliente.invalidateQueries({ queryKey: LOTE_KEY });
  // D-611: sem corte (a central mistura vários), refresca o histórico de
  // todos — e a central sempre, porque um "publiquei" pode tirar o short dela.
  cliente.invalidateQueries({
    queryKey: corteId ? publicacoesKey(corteId) : ['shorts', 'publicacoes'],
  });
  cliente.invalidateQueries({ queryKey: PRONTOS_KEY });
  // D-905: o chip da rede, no cartão do Fire, acende com este clique. Sem isto a
  // lista seguia no cache por até 30 s — justo quando se decide finalizar.
  cliente.invalidateQueries({ queryKey: FIRES_KEY });
}

/**
 * D-1051: publicar pelo painel relê o mesmo que o "publiquei". Sem isso, o cartão e a
 * trilha seguiam dizendo que o short não subiu. Vai pela promessa, e não pelo callback do
 * `mutate`, que não roda se o painel fechar durante o upload. O erro o painel lê do estado.
 */
export function usePublicarEAtualizar(corteId: string) {
  const cliente = useQueryClient();
  const publicar = usePublicarShort();
  return {
    ...publicar,
    mutate: (pedido: Parameters<typeof publicar.mutate>[0]) => {
      publicar
        .mutateAsync(pedido)
        .then(() => atualizarDepoisDoPubliquei(cliente, corteId))
        .catch(() => undefined);
    },
  };
}

/**
 * D-1051: cada short que o lote sobe relê o corte aberto, como faz a central de Prontos.
 * Sem isso, o cartão e a trilha seguiam em "YT 0" com o vídeo já no ar.
 */
export function useRelerPublicacoesDoLote(corteId: string) {
  const cliente = useQueryClient();
  const lote = useLoteAtual().data?.lote;
  const publicados = lote
    ? lote.raias.flatMap((r) => r.itens).filter((i) => i.estado === 'publicado').length
    : 0;
  const anterior = useRef(publicados);
  useEffect(() => {
    if (publicados === anterior.current) return;
    anterior.current = publicados;
    if (corteId) atualizarDepoisDoPubliquei(cliente, corteId);
  }, [publicados, corteId, cliente]);
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
