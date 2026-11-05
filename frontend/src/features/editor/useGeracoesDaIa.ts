import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { geracaoIaApi } from '@/features/ia';
import { invalidaCorte } from './useCortes';
import { atualizarLegendasDoCorte } from '@/features/shorts/legendasDoCorte';
import type { ProviderIA } from '@/lib/providerIa';

// As gerações do corte que chamam a IA pela assinatura: trechos, cenas e
// metadados. D-723: saíram do useEditor.

// D-420 — chaves das gerações via Claude, POR CORTE.
//
// A geração continua depois de trocar de corte, e cada corte abre numa instância
// nova da tela (D-1033): um `isPending` de componente se perderia na volta. Com a
// mutação chaveada, o estado de execução vive no cache do react-query e é
// individual por corte — mesmo padrão do D-418.
export const metadadosClaudeKey = (corteId: string) => ['claude-metadados', corteId] as const;

export const trechosClaudeKey = (corteId: string) => ['claude-trechos', corteId] as const;

export const cenasClaudeKey = (corteId: string) => ['claude-cenas', corteId] as const;

// Fora da chave do corte de propósito: `invalidaCorte` roda de dentro da consulta
// e, sob a mesma chave, cancelaria a própria consulta que a chamou.
export const cenasEmGeracaoKey = (corteId: string) => ['cenas-em-geracao', corteId] as const;

/** Estado da geração de metadados via Claude DESTE corte. `concluido`/`erro`
 * valem até o react-query coletar a mutação encerrada (gcTime). */
export function useStatusMetadadosClaude(
  corteId: string,
): 'pendente' | 'rodando' | 'concluido' | 'erro' {
  const estados = useMutationState({
    filters: { mutationKey: metadadosClaudeKey(corteId), exact: true },
    select: (mutation) => mutation.state.status,
  });
  const ultimo = estados.at(-1);
  if (ultimo === 'pending') return 'rodando';
  if (ultimo === 'error') return 'erro';
  if (ultimo === 'success') return 'concluido';
  return 'pendente';
}

/** Geração de trechos em voo DESTE corte e qual provider a disparou. */
export function useTrechosClaudeEmAndamento(corteId: string) {
  const mutations = useMutationState({
    filters: { mutationKey: trechosClaudeKey(corteId), exact: true, status: 'pending' },
    select: (mutation) => mutation.state.variables as 'claude' | 'gemini',
  });
  return { isPending: mutations.length > 0, provider: mutations[0] };
}

// F-038 — regera os trechos a remover (desvios) do corte via Claude e
// ressincroniza a transcrição final. O endpoint não devolve o Corte, então
// invalidamos a query para refetch do corte atualizado.
/** D-1017: o toast da geração. A marca recusada não pode parecer que sumiu (RN-35). */
export function mensagemDosTrechosGerados(data: {
  novos: number;
  total_desvios: number;
  recusados?: number;
}): string {
  const base =
    data.novos > 0
      ? `+${data.novos} novo(s) trecho(s) via IA (total: ${data.total_desvios}).`
      : `Nenhum trecho novo a remover (total: ${data.total_desvios}).`;
  return data.recusados
    ? `${base} ${data.recusados} recusado(s): a citação não confere. Estão em Riscados.`
    : base;
}

export function useGerarTrechosClaude(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationKey: trechosClaudeKey(corteId),
    mutationFn: (provider: 'claude' | 'gemini' = 'claude') => geracaoIaApi.gerarTrechosClaude(corteId, provider),
    onSuccess: (data) => {
      notify(mensagemDosTrechosGerados(data), { tone: 'success' });
      invalidaCorte(qc, corteId, projetoId);
      void atualizarLegendasDoCorte(qc, corteId);
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao gerar trechos via IA.', {
        tone: 'error',
      });
    },
  });
}

// F-038 — gera as cenas Remotion do corte via Claude (skill cenas-expert).
export function useGerarCenasClaude(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationKey: cenasClaudeKey(corteId),
    mutationFn: (provider: 'claude' | 'gemini' = 'claude') => geracaoIaApi.gerarCenasClaude(corteId, provider),
    onSuccess: (data) => {
      notify(`${data.total_cenas} cena(s) gerada(s) via IA.`, { tone: 'success' });
      invalidaCorte(qc, corteId, projetoId);
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao gerar cenas via IA.', {
        tone: 'error',
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: cenasEmGeracaoKey(corteId) }),
  });
}

/** Pergunta ao servidor. Quando a geração de fora termina, as cenas novas estão no
 * banco e o corte em cache ficou velho: é o que faz a Pós mostrá-las sozinha. */
export async function buscarCenasEmGeracao(qc: QueryClient, corteId: string, projetoId?: string) {
  const antes = qc.getQueryData<{ em_geracao: boolean }>(cenasEmGeracaoKey(corteId))?.em_geracao;
  const agora = await geracaoIaApi.cenasEmGeracao(corteId);
  if (antes && !agora.em_geracao) invalidaCorte(qc, corteId, projetoId);
  return agora;
}

const INTERVALO_GERANDO_MS = 2_500;
const INTERVALO_LIVRE_MS = 5_000;

/**
 * D-1037: as cenas deste corte estão sendo geradas? Duas fontes, porque cada uma
 * vê o que a outra não vê: a mutação responde no instante do clique e sabe o
 * provedor; o servidor é o único que vê a cadeia do bruto e sobrevive a recarregar
 * a página. A cadeia é sempre do Claude, daí o padrão.
 */
export function useCenasEmGeracao(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const noClique = useMutationState({
    filters: { mutationKey: cenasClaudeKey(corteId), exact: true, status: 'pending' },
    select: (mutation) => mutation.state.variables as ProviderIA | undefined,
  });
  const noServidor = useQuery({
    queryKey: cenasEmGeracaoKey(corteId),
    queryFn: () => buscarCenasEmGeracao(qc, corteId, projetoId),
    refetchInterval: (query) =>
      query.state.data?.em_geracao ? INTERVALO_GERANDO_MS : INTERVALO_LIVRE_MS,
  });
  const emGeracao = noClique.length > 0 || Boolean(noServidor.data?.em_geracao);
  const provider: ProviderIA | null = emGeracao ? (noClique[0] ?? 'claude') : null;
  return { emGeracao, provider };
}

// F-038 — gera os metadados do corte via Claude (skill metadados-expert).
export function useGerarMetadadosClaude(corteId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationKey: metadadosClaudeKey(corteId),
    // D-1043: o gesto do bruto preenche o que falta; "Também refazer" pede `substituir`.
    mutationFn: (pedido: 'claude' | 'gemini' | { substituir: true } = 'claude') =>
      typeof pedido === 'string'
        ? geracaoIaApi.gerarMetadadosClaude(corteId, pedido)
        : geracaoIaApi.regerarMetadadosClaude(corteId),
    onSuccess: () => {
      notify('Metadados gerados via IA.', { tone: 'success' });
      qc.invalidateQueries({ queryKey: ['metadado', corteId] });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao gerar metadados via IA.', {
        tone: 'error',
      });
    },
  });
}
