import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { geracaoIaApi } from '@/features/ia';
import { invalidaCorte } from './useCortes';

// As gerações do corte que chamam a IA pela assinatura: trechos, cenas e
// metadados. D-723: saíram do useEditor.

// D-420 — chaves das gerações via Claude, POR CORTE.
//
// A rota `/projetos/:id/cortes/:corteId` renderiza o MESMO elemento para todos
// os cortes, então trocar de corte não remonta o editor: um `isPending` de
// componente sobrevivia à troca e desabilitava o botão do corte novo por causa
// da execução do anterior. Com a mutação chaveada, o estado de execução vive no
// cache do react-query e é individual por corte — mesmo padrão do D-418.
export const metadadosClaudeKey = (corteId: string) => ['claude-metadados', corteId] as const;

export const trechosClaudeKey = (corteId: string) => ['claude-trechos', corteId] as const;

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
export function useGerarTrechosClaude(corteId: string, projetoId?: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationKey: trechosClaudeKey(corteId),
    mutationFn: (provider: 'claude' | 'gemini' = 'claude') => geracaoIaApi.gerarTrechosClaude(corteId, provider),
    onSuccess: (data) => {
      const msg =
        data.novos > 0
          ? `+${data.novos} novo(s) trecho(s) via IA (total: ${data.total_desvios}).`
          : `Nenhum trecho novo a remover (total: ${data.total_desvios}).`;
      notify(msg, { tone: 'success' });
      invalidaCorte(qc, corteId, projetoId);
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
  });
}

// F-038 — gera os metadados do corte via Claude (skill metadados-expert).
export function useGerarMetadadosClaude(corteId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationKey: metadadosClaudeKey(corteId),
    mutationFn: (provider: 'claude' | 'gemini' = 'claude') => geracaoIaApi.gerarMetadadosClaude(corteId, provider),
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
