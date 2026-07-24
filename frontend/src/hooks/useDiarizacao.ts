// D-286 (Phase C) — hooks da diarização de falantes (canal vs. reagidos).
//
// Vivem num arquivo próprio (e não em useProjetoDetalhe.ts, que está sob lock)
// para não tocar features protegidas. Reutilizam as query-keys existentes para
// manter as invalidações consistentes com o resto do detalhe do projeto.
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DiarizarResponse, type FalantesMap } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { corteKey, cortesProjetoKey } from './useEditor';
import { exportStatusKey } from './useProjetoDetalhe';

export const falantesKey = (id: string) => ['projeto', id, 'falantes'] as const;

const DIARIZACAO_API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

/** Diariza SÓ a janela de um corte (D-360). Fetch inline para não tocar o
 * `api.ts` sob lock. Reprojeta a transcrição do corte no backend, então basta
 * invalidar o corte para a etiqueta de falante aparecer no editor. */
async function diarizarCorteRequest(corteId: string): Promise<DiarizarResponse> {
  const res = await fetch(`${DIARIZACAO_API_BASE}/diarizacao/corte/${corteId}/diarizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }
  return (await res.json()) as DiarizarResponse;
}

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

/** Diariza apenas o corte atual (D-360), sem rodar o vídeo inteiro. Ao concluir,
 * invalida o corte (a `transcricao_corte` volta com `speaker`) e o mapa de
 * falantes do projeto. Degrada com toast quando `ok=false`. */
export function useDiarizarCorte(corteId: string, projetoId: string | undefined) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: () => diarizarCorteRequest(corteId),
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
