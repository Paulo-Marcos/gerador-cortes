// D-804: camada de I/O (react-query) da capa gerada no ChatGPT.
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  capaChatgptApi,
  elencoDaCapa,
  fotoDaPessoa,
  subirFotoDaPessoa,
  type ConfiguracaoCapaChatgpt,
  type DestinoDaCapa,
  type PedidoCapaChatgpt,
} from './api';

const CONFIGURACAO_KEY = ['capa-chatgpt', 'configuracao'] as const;
const ELENCO_KEY = ['capa-chatgpt', 'elenco'] as const;

export function useConfiguracaoCapaChatgpt() {
  return useQuery<ConfiguracaoCapaChatgpt>({
    queryKey: CONFIGURACAO_KEY,
    queryFn: capaChatgptApi.configuracao,
    staleTime: 30_000,
  });
}

function useAlterarConfiguracao<T>(alterar: (valor: T) => Promise<ConfiguracaoCapaChatgpt>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: alterar,
    // A resposta já É a configuração nova: gravar direto evita um GET a mais.
    onSuccess: (config) => qc.setQueryData(CONFIGURACAO_KEY, config),
  });
}

export const useGravarProjetoChatgpt = () => useAlterarConfiguracao(capaChatgptApi.gravarProjeto);
export const useSubirFichaChatgpt = () => useAlterarConfiguracao(capaChatgptApi.subirFicha);
export const useRemoverFichaChatgpt = () => useAlterarConfiguracao(capaChatgptApi.removerFicha);

// D-899: o prompt entra na chave porque "Gerar prompt" já põe a imagem na fila
// pelo backend — prompt novo é pedido possivelmente novo, e a leitura refaz-se só.
export const pedidoKey = (destino: DestinoDaCapa, alvoId: string, prompt: string) =>
  ['capa-chatgpt', 'pedido', destino, alvoId, prompt] as const;

// O robô leva cerca de um minuto; dois segundos mostram cada passo sem martelar.
const INTERVALO_DO_PEDIDO_MS = 2000;

export const pedidoEmVoo = (pedido?: PedidoCapaChatgpt | null) =>
  pedido?.estado === 'aguardando' || pedido?.estado === 'rodando';

/**
 * O pedido terminou bem ENTRE duas leituras desta tela. Um pedido que já chegou
 * pronto não conta: a capa dele já está na tela.
 */
export const terminouAgora = (
  antes: PedidoCapaChatgpt | null | undefined,
  atual: PedidoCapaChatgpt | null | undefined,
) => atual?.estado === 'concluido' && pedidoEmVoo(antes) && antes?.id === atual.id;

/**
 * D-898: o pedido desta capa na fila do robô, relido enquanto anda. O estado
 * mora no backend: fechar o modal não perde o passo nem o motivo de uma parada.
 *
 * `aoConcluir` roda quando ESTA tela vê o pedido terminar bem (`terminouAgora`)
 * — é a deixa para reler a capa, que o backend acabou de salvar.
 */
export function usePedidoDaCapa(
  destino: DestinoDaCapa,
  alvoId: string,
  prompt: string,
  aoConcluir?: () => void,
) {
  const pedido = useQuery({
    queryKey: pedidoKey(destino, alvoId, prompt),
    queryFn: () => capaChatgptApi.pedido(destino, alvoId),
    enabled: Boolean(alvoId),
    refetchInterval: (query) => (pedidoEmVoo(query.state.data) ? INTERVALO_DO_PEDIDO_MS : false),
  });
  const visto = useRef<PedidoCapaChatgpt | null | undefined>(undefined);
  const atual = pedido.data;
  useEffect(() => {
    const antes = visto.current;
    visto.current = atual;
    if (terminouAgora(antes, atual)) aoConcluir?.();
  }, [atual, aoConcluir]);
  return pedido;
}

/** Põe a capa na fila; a resposta já é o pedido, e a leitura passa a acompanhá-lo. */
export function usePedirNoChatGPT(destino: DestinoDaCapa, alvoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prompt, pessoas }: { prompt: string; pessoas?: string[] }) =>
      capaChatgptApi.pedir(destino, alvoId, prompt, pessoas),
    onSuccess: (pedido, { prompt }) => qc.setQueryData(pedidoKey(destino, alvoId, prompt), pedido),
  });
}

/**
 * D-840: as pessoas reais do prompt e a foto de cada uma. Busca sozinha, ao
 * aparecer o prompt: o operador confere o elenco antes de clicar, sem pedir.
 * O prompt é a chave: o mesmo texto dá o mesmo elenco.
 */
export function useElencoDaCapa(prompt: string, ligado: boolean) {
  return useQuery({
    queryKey: [...ELENCO_KEY, prompt],
    queryFn: () => elencoDaCapa(prompt),
    enabled: ligado && Boolean(prompt),
    staleTime: Infinity,
  });
}

export const useFotoDaPessoa = () => useMutation({ mutationFn: fotoDaPessoa });

/** A foto nova vale para toda capa com essa pessoa: os elencos em cache releem. */
export function useSubirFotoDaPessoa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nome, arquivo }: { nome: string; arquivo: File }) =>
      subirFotoDaPessoa(nome, arquivo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ELENCO_KEY }),
  });
}
