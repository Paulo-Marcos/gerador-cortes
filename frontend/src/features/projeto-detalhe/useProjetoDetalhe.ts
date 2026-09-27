import type { ProviderIA } from '@/lib/providerIa';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assinarProgresso } from '@/shared/api/realtime';
import { cortesApi } from '@/features/editor/api/cortes';
import {
  analiseApi,
  type AnalisarIntervaloRequest,
  type ImportarAnaliseRequest,
} from '@/features/projetos/analise';
import { geracaoIaApi } from '@/features/ia';
import { projetosApi } from '@/features/projetos/api';
import { useToast } from '@/components/ui/toaster';
import type { ProgressoUpdate } from '@/types/models';
import { cortesProjetoKey, exportStatusKey, projetoKey } from '@/shared/chavesDeCache';
import {
  publicacaoApi,
  type LiberarPublicacaoRequest,
  type YouTubeManualPublishRequest,
  type YouTubeUploadRequest,
} from '@/features/publicacao/api';

export { exportStatusKey, projetoKey };

export function useProjeto(id: string | undefined) {
  return useQuery({
    queryKey: projetoKey(id ?? ''),
    queryFn: () => projetosApi.obterProjeto(id!),
    enabled: !!id,
    staleTime: 5_000,
  });
}

// I-034: audit trail da última análise IA. Lazy-fetched só quando o modal abre.
export const auditoriaAnaliseKey = (id: string) => ['projeto', id, 'auditoria-analise'] as const;
export function useAuditoriaAnalise(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: auditoriaAnaliseKey(id ?? ''),
    queryFn: () => analiseApi.obterAuditoriaAnalise(id!),
    enabled: !!id && enabled,
    staleTime: 30_000,
  });
}

export function useExportStatus(id: string | undefined) {
  return useQuery({
    queryKey: exportStatusKey(id ?? ''),
    queryFn: () => publicacaoApi.exportStatus(id!),
    enabled: !!id,
    refetchInterval: 8_000,
    staleTime: 3_000,
  });
}

export function useAbrirPasta() {
  return useMutation({
    mutationFn: (corteId: string) => cortesApi.abrirPastaCorte(corteId),
  });
}

/** D-746: abre a pasta da live — o botão da live usava a rota do corte. */
export function useAbrirPastaProjeto() {
  return useMutation({
    mutationFn: (projetoId: string) => projetosApi.abrirPastaProjeto(projetoId),
  });
}

export function useRefazerTranscricao(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => analiseApi.refazerTranscricao(projetoId),
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
    mutationFn: () => analiseApi.reanalisarProjeto(projetoId),
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
    mutationFn: () => geracaoIaApi.analisarViaClaude(projetoId),
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
    mutationFn: (provider: ProviderIA) => cortesApi.analisarDesviosTodos(projetoId, provider),
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
    mutationFn: (body: AnalisarIntervaloRequest) => analiseApi.analisarIntervalo(projetoId, body),
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
    mutationFn: (body: ImportarAnaliseRequest) => analiseApi.importarAnalise(projetoId, body),
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
        ? analiseApi.obterPromptAnaliseIntervalo(projetoId, intervalo)
        : analiseApi.obterPromptAnalise(projetoId),
    enabled,
    staleTime: 60_000,
  });
}

export function useUploadYouTube() {
  return useMutation({
    mutationFn: ({ corteId, body }: { corteId: string; body: YouTubeUploadRequest }) =>
      publicacaoApi.uploadYouTube(corteId, body),
  });
}

export function useMarcarPublicadoYouTube() {
  return useMutation({
    mutationFn: ({ corteId, body }: { corteId: string; body: YouTubeManualPublishRequest }) =>
      publicacaoApi.marcarPublicadoYouTube(corteId, body),
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
      publicacaoApi.liberarPublicacao(corteId, body),
  });
}

/**
 * Acompanha o progresso de `projetoId` enquanto o componente estiver montado e
 * devolve o último update. Sempre que o status muda — ou a linha volta depois
 * de cair — relê as queries de projeto, para o resto da UI se ressincronizar.
 * A conexão e a política de religar moram em `shared/api/realtime` (D-724).
 */
export function useProjetoProgressoWS(projetoId: string | undefined): ProgressoUpdate | null {
  const qc = useQueryClient();
  const [update, setUpdate] = useState<ProgressoUpdate | null>(null);

  useEffect(() => {
    if (!projetoId) return;
    let ultimoStatus: ProgressoUpdate['status'] | null = null;
    const ressincronizar = () => {
      void qc.invalidateQueries({ queryKey: projetoKey(projetoId) });
      void qc.invalidateQueries({ queryKey: ['projetos'] });
    };
    return assinarProgresso(projetoId, {
      aoReceber: (msg) => {
        setUpdate(msg);
        if (msg.status !== ultimoStatus) {
          ultimoStatus = msg.status;
          ressincronizar();
        }
      },
      aoReligar: ressincronizar,
    });
  }, [projetoId, qc]);

  return update;
}
