// D-286 (Phase C) — hooks da diarização de falantes (canal vs. reagidos).
//
// Vivem num arquivo próprio (e não em useProjetoDetalhe.ts, que está sob lock)
// para não tocar features protegidas. Reutilizam as query-keys existentes para
// manter as invalidações consistentes com o resto do detalhe do projeto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type FalantesMap } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cortesProjetoKey } from './useEditor';
import { exportStatusKey } from './useProjetoDetalhe';

export const falantesKey = (id: string) => ['projeto', id, 'falantes'] as const;

/** Mapa de falantes persistido do projeto (vazio se ainda não diarizado). */
export function useFalantes(projetoId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: falantesKey(projetoId ?? ''),
    queryFn: () => api.obterFalantes(projetoId!),
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
    mutationFn: () => api.diarizarProjeto(projetoId),
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

/** Rebatiza os falantes (nome + quem é o canal), sem reprocessar a transcrição. */
export function useAtualizarFalantes(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: (falantes: FalantesMap) => api.atualizarFalantes(projetoId, falantes),
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

/** Análise via Claude com o toggle de diarização (D-286).
 * Espelha as invalidações de `useAnalisarViaClaude`, mas encaminha
 * `usar_diarizacao` para injetar (ou não) o rótulo de falante no prompt. */
export function useAnalisarComDiarizacao(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: (usarDiarizacao: boolean) => api.analisarViaClaude(projetoId, usarDiarizacao),
    onSuccess: (data) => {
      notify(`Análise via Claude concluída: ${data.total_cortes ?? 0} corte(s).`, {
        tone: 'success',
      });
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['projetos'] });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro na análise via Claude.', {
        tone: 'error',
      });
    },
  });
}
