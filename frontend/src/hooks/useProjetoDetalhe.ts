import type { ProviderIA } from '@/lib/providerIa';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, progressoWsUrl } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import type {
  AnalisarIntervaloRequest,
  ImportarAnaliseRequest,
  LiberarPublicacaoRequest,
  ProgressoUpdate,
  YouTubeManualPublishRequest,
  YouTubeUploadRequest,
} from '@/types/models';
import { cortesProjetoKey } from './useEditor';

export const projetoKey = (id: string) => ['projeto', id] as const;
export const exportStatusKey = (id: string) => ['projeto', id, 'export-status'] as const;

export function useProjeto(id: string | undefined) {
  return useQuery({
    queryKey: projetoKey(id ?? ''),
    queryFn: () => api.obterProjeto(id!),
    enabled: !!id,
    staleTime: 5_000,
  });
}

// I-034: audit trail da última análise IA. Lazy-fetched só quando o modal abre.
export const auditoriaAnaliseKey = (id: string) => ['projeto', id, 'auditoria-analise'] as const;
export function useAuditoriaAnalise(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: auditoriaAnaliseKey(id ?? ''),
    queryFn: () => api.obterAuditoriaAnalise(id!),
    enabled: !!id && enabled,
    staleTime: 30_000,
  });
}

export function useExportStatus(id: string | undefined) {
  return useQuery({
    queryKey: exportStatusKey(id ?? ''),
    queryFn: () => api.exportStatus(id!),
    enabled: !!id,
    refetchInterval: 8_000,
    staleTime: 3_000,
  });
}

export function useAbrirPasta() {
  return useMutation({
    mutationFn: (corteId: string) => api.abrirPastaCorte(corteId),
  });
}

export function useRefazerTranscricao(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refazerTranscricao(projetoId),
    onSuccess: () => {
      // Após re-baixar a transcrição via json3, todos os cortes têm
      // transcricao_corte/transcricao_final reescritos no banco.
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: projetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['corte'] });
    },
  });
}

export function useReanalisar(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.reanalisarProjeto(projetoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['projetos'] });
    },
  });
}

// F-038 — análise completa via Claude (substitui cortes + encadeia
// refazer-transcrição no backend). Mesmas invalidações da reanálise.
export function useAnalisarViaClaude(projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: () => api.analisarViaClaude(projetoId),
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

// D-304: dispara em lote a geração de trechos (trechos-expert/Claude) para
// TODOS os cortes do projeto. Fire-and-forget — o backend não expõe
// progresso, então o hook só mantém um cooldown local (`disparado`) para
// evitar duplo disparo enquanto o toast de aviso ainda está visível.
const COOLDOWN_DESVIOS_TODOS_MS = 10_000;

export function useAnalisarDesviosTodos(projetoId: string) {
  const { notify } = useToast();
  const [disparado, setDisparado] = useState(false);
  const cooldownRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (cooldownRef.current !== null) window.clearTimeout(cooldownRef.current);
  }, []);

  const mutation = useMutation({
    mutationFn: (provider: ProviderIA) => api.analisarDesviosTodos(projetoId, provider),
    onSuccess: () => {
      notify(
        'Geração de trechos iniciada para todos os cortes: roda em segundo plano, corte a corte, e os desvios vão aparecendo aos poucos. Só ACRESCENTA aos trechos já marcados — nada é removido.',
        { tone: 'success' },
      );
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Falha ao iniciar a geração de trechos.', {
        tone: 'error',
      });
    },
  });

  function disparar(provider: ProviderIA) {
    setDisparado(true);
    mutation.mutate(provider, {
      onSettled: () => {
        cooldownRef.current = window.setTimeout(() => setDisparado(false), COOLDOWN_DESVIOS_TODOS_MS);
      },
    });
  }

  return { disparar, disparado: disparado || mutation.isPending };
}

export function useAnalisarIntervalo(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnalisarIntervaloRequest) => api.analisarIntervalo(projetoId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['projetos'] });
    },
  });
}

export function useImportarAnalise(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportarAnaliseRequest) => api.importarAnalise(projetoId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      qc.invalidateQueries({ queryKey: ['projetos'] });
    },
  });
}

export function usePromptAnalise(
  projetoId: string,
  enabled: boolean,
  intervalo?: AnalisarIntervaloRequest & { blocos: number },
) {
  return useQuery({
    queryKey: ['projeto', projetoId, 'analise', 'prompt', intervalo],
    queryFn: () =>
      intervalo
        ? api.obterPromptAnaliseIntervalo(projetoId, intervalo)
        : api.obterPromptAnalise(projetoId),
    enabled,
    staleTime: 60_000,
  });
}

export function useUploadYouTube() {
  return useMutation({
    mutationFn: ({ corteId, body }: { corteId: string; body: YouTubeUploadRequest }) =>
      api.uploadYouTube(corteId, body),
  });
}

export function useMarcarPublicadoYouTube() {
  return useMutation({
    mutationFn: ({ corteId, body }: { corteId: string; body: YouTubeManualPublishRequest }) =>
      api.marcarPublicadoYouTube(corteId, body),
  });
}

/**
 * D-566: devolve um corte publicado para a fila de publicação.
 *
 * Não é um upload: é o app aceitando ser informado de que o vídeo saiu do ar
 * lá fora. Depois disso o botão de enviar reaparece sozinho, porque ele sempre
 * olhou para a marca — e agora a marca não está mais lá.
 */
export function useLiberarPublicacao() {
  return useMutation({
    mutationFn: ({ corteId, body }: { corteId: string; body: LiberarPublicacaoRequest }) =>
      api.liberarPublicacao(corteId, body),
  });
}

/**
 * Conecta ao WebSocket de progresso (`/api/projetos/{id}/ws`) enquanto o componente
 * estiver montado. Retorna o ultimo update recebido. Invalida as queries de projeto
 * sempre que o backend muda de status, para que o restante da UI re-sincronize.
 */
export function useProjetoProgressoWS(projetoId: string | undefined): ProgressoUpdate | null {
  const qc = useQueryClient();
  const [update, setUpdate] = useState<ProgressoUpdate | null>(null);

  useEffect(() => {
    if (!projetoId) return;
    let lastStatus: ProgressoUpdate['status'] | null = null;
    // D-227: guarda contra troca rápida de projeto. Ao remontar o effect, a
    // conexão anterior é fechada no cleanup, mas um socket ainda CONNECTING pode
    // disparar onmessage depois. `ativo` garante uma única conexão efetiva e
    // ignora eventos da conexão já descartada (sem setState pós-cleanup).
    let ativo = true;
    const ws = new WebSocket(progressoWsUrl(projetoId));

    ws.onmessage = (event) => {
      if (!ativo) return;
      try {
        const msg = JSON.parse(event.data) as ProgressoUpdate;
        setUpdate(msg);
        if (msg.status !== lastStatus) {
          lastStatus = msg.status;
          void qc.invalidateQueries({ queryKey: projetoKey(projetoId) });
          void qc.invalidateQueries({ queryKey: ['projetos'] });
        }
      } catch {
        /* mensagem mal formada — ignora */
      }
    };

    return () => {
      ativo = false;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [projetoId, qc]);

  return update;
}
