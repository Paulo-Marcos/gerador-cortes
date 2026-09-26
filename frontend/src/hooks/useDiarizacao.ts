// D-286 (Phase C) — hooks da diarização de falantes (canal vs. reagidos).
//
// Vivem num arquivo próprio (e não em useProjetoDetalhe.ts, que está sob lock)
// para não tocar features protegidas. Reutilizam as query-keys existentes para
// manter as invalidações consistentes com o resto do detalhe do projeto.
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diarizacaoApi, type FalantesMap } from '@/features/diarizacao/api';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { corteKey, cortesProjetoKey } from './useEditor';
import { exportStatusKey } from './useProjetoDetalhe';

export const falantesKey = (id: string) => ['projeto', id, 'falantes'] as const;


/** Mapa de falantes persistido do projeto (vazio se ainda não diarizado). */
export function useFalantes(projetoId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: falantesKey(projetoId ?? ''),
    queryFn: () => diarizacaoApi.obterFalantes(projetoId!),
    enabled: !!projetoId && enabled,
    staleTime: 30_000,
  });
}

/** Dispara a diarização (pyannote) sob demanda. Degrada com toast quando
 * `ok=false` (sem token/lib) — a transcrição fica intacta, sem rótulo. */
export function useDiarizarProjeto(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: () => diarizacaoApi.diarizarProjeto(projetoId),
    onSuccess: (data) => {
      if (data.ok) {
        const total = data.falantes ? Object.keys(data.falantes).length : 0;
        notify(`Diarização concluída: ${total} falante(s) identificado(s).`, { tone: 'success' });
        qc.invalidateQueries({ queryKey: falantesKey(projetoId) });
      } else {
        notify(data.motivo ?? 'Diarização indisponível.', { tone: 'error' });
      }
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro na diarização.', { tone: 'error' });
    },
  });
}

/** Diariza apenas o corte atual (D-360), sem rodar o vídeo inteiro. Ao concluir,
 * invalida o corte (a `transcricao_corte` volta com `speaker`) e o mapa de
 * falantes do projeto. Degrada com toast quando `ok=false`. */
export function useDiarizarCorte(corteId: string, projetoId: string | undefined) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    // Reprojeta a transcrição do corte no backend: basta invalidar o corte para a
    // etiqueta de falante aparecer no editor.
    mutationFn: () => diarizacaoApi.diarizarCorte(corteId),
    onSuccess: (data) => {
      if (data.ok) {
        const total = data.falantes ? Object.keys(data.falantes).length : 0;
        notify(`Corte diarizado: ${total} falante(s) no mapa do projeto.`, { tone: 'success' });
        qc.invalidateQueries({ queryKey: corteKey(corteId) });
        if (projetoId) qc.invalidateQueries({ queryKey: falantesKey(projetoId) });
      } else {
        notify(data.motivo ?? 'Diarização indisponível.', { tone: 'error' });
      }
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro na diarização do corte.', {
        tone: 'error',
      });
    },
  });
}

/** Rebatiza os falantes (nome + quem é o canal), sem reprocessar a transcrição. */
export function useAtualizarFalantes(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: (falantes: FalantesMap) => diarizacaoApi.atualizarFalantes(projetoId, falantes),
    onSuccess: () => {
      notify('Falantes atualizados.', { tone: 'success' });
      qc.invalidateQueries({ queryKey: falantesKey(projetoId) });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao salvar falantes.', {
        tone: 'error',
      });
    },
  });
}

/** Chave da análise via Claude, POR PROJETO (D-418).
 *
 * A rota `/projetos/:id` renderiza o mesmo elemento para todas as lives, então
 * trocar de live pelo rail não remonta a página: um `isPending` de componente
 * vazava o "Gerando..." de uma live para a outra. Com a mutação chaveada, o
 * estado de execução vive no cache do react-query e é individual por live.
 */
export const analiseClaudeKey = (projetoId: string) => ['analise-claude', projetoId] as const;

/** True enquanto ESTA live tem análise via Claude em voo — inclusive quando quem
 * disparou já foi desmontado (o usuário abriu outra live e voltou). */
export function useAnaliseClaudeEmAndamento(projetoId: string): boolean {
  return useIsMutating({ mutationKey: analiseClaudeKey(projetoId), exact: true }) > 0;
}

/** Análise via Claude com o toggle de diarização (D-286).
 * Espelha as invalidações de `useAnalisarViaClaude`, mas encaminha
 * `usar_diarizacao` para injetar (ou não) o rótulo de falante no prompt. */
export function useAnalisarComDiarizacao(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationKey: analiseClaudeKey(projetoId),
    mutationFn: ({
      usarDiarizacao,
      provider = 'claude',
    }: {
      usarDiarizacao: boolean;
      provider?: 'claude' | 'gemini';
    }) => api.analisarViaClaude(projetoId, usarDiarizacao, provider),
    onSuccess: (data) => {
      const via = data.provider === 'gemini' ? 'Gemini' : 'Claude';
      notify(`Análise via ${via} concluída: ${data.total_cortes ?? 0} corte(s).`, {
        tone: 'success',
      });
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['projetos'] });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro na análise por IA.', {
        tone: 'error',
      });
    },
  });
}
