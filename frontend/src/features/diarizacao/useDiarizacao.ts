// D-286 (Phase C) — hooks da diarização de falantes (canal vs. reagidos).
//
// Vivem num arquivo próprio (e não em useProjetoDetalhe.ts, que está sob lock)
// para não tocar features protegidas. Reutilizam as query-keys existentes para
// manter as invalidações consistentes com o resto do detalhe do projeto.
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { diarizacaoApi, type FalantesMap } from './api';
import { geracaoIaApi } from '@/features/ia';
import { useToast } from '@/components/ui/toaster';
import { corteKey, cortesProjetoKey, exportStatusKey } from '@/shared/chavesDeCache';
import {
  atualizarLegendasDoCorte,
  esquecerLegendasDosCortes,
} from '@/features/shorts/legendasDoCorte';
import type { ProviderIA } from '@/lib/providerIa';
import {
  analisarComAsDuas,
  avisoDasDuas,
  quemAnalisa,
  type DesfechoDaAnalise,
  type PedidoDeAnalise,
} from './analiseComAsDuas';

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
        void atualizarLegendasDoCorte(qc, corteId);
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
    }) => geracaoIaApi.analisarViaClaude(projetoId, usarDiarizacao, provider),
    onSuccess: (data) => {
      const via = data.provider === 'gemini' ? 'Gemini' : 'Claude';
      notify(`Análise via ${via} concluída: ${data.total_cortes ?? 0} corte(s).`, {
        tone: 'success',
      });
      aoConcluirAnalise(qc, projetoId);
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro na análise por IA.', {
        tone: 'error',
      });
    },
  });
}

function aoConcluirAnalise(qc: QueryClient, projetoId: string) {
  qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
  qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
  qc.invalidateQueries({ queryKey: ['projetos'] });
  // D-973: a análise encadeia o refazer-transcrição de todos os cortes.
  void esquecerLegendasDosCortes(qc);
}

/** D-977: qual IA da dupla está analisando agora. Mora no cache, por live: o
 * botão some ao fechar o modal, e ao reabrir tem de girar na IA certa. */
export const analiseVezKey = (projetoId: string) => ['analise-vez', projetoId] as const;

type AnalisarUma = (
  provider: ProviderIA,
  usarDiarizacao: boolean,
) => Promise<{ total_cortes?: number | null }>;

/** As opções da análise com as duas IAs, o Claude e depois o Gemini, fora do
 * hook para o teste montar a mutação direto no cache. Usa a mesma chave da
 * análise simples: para a tela é uma análise da live em voo, e os três botões
 * travam juntos. */
export function opcoesDaAnaliseComAsDuas(
  qc: QueryClient,
  projetoId: string,
  avisar: (texto: string, tom: 'success' | 'error') => void,
  analisar: AnalisarUma = (provider, usarDiarizacao) =>
    geracaoIaApi.analisarViaClaude(projetoId, usarDiarizacao, provider),
) {
  return {
    mutationKey: analiseClaudeKey(projetoId),
    mutationFn: ({ usarDiarizacao }: PedidoDeAnalise): Promise<DesfechoDaAnalise[]> =>
      analisarComAsDuas(
        (provider) => analisar(provider, usarDiarizacao),
        (provider) => qc.setQueryData(analiseVezKey(projetoId), provider),
      ),
    onSuccess: (desfechos: DesfechoDaAnalise[]) => {
      const aviso = avisoDasDuas(desfechos);
      avisar(aviso.texto, aviso.tom);
      aoConcluirAnalise(qc, projetoId);
    },
    onSettled: () => qc.setQueryData(analiseVezKey(projetoId), null),
  };
}

export function useAnalisarComAsDuas(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation(
    opcoesDaAnaliseComAsDuas(qc, projetoId, (texto, tone) => notify(texto, { tone })),
  );
}

/** Quem analisa esta live agora, lido do cache (sobrevive a fechar o modal). */
export function useQuemAnalisa(projetoId: string) {
  const pedidos = useMutationState({
    filters: { mutationKey: analiseClaudeKey(projetoId), exact: true, status: 'pending' },
    select: (m) => m.state.variables as PedidoDeAnalise | undefined,
  });
  const vez = useQuery<ProviderIA | null>({
    queryKey: analiseVezKey(projetoId),
    queryFn: () => null,
    enabled: false,
  }).data;
  return quemAnalisa(pedidos, vez ?? null);
}
