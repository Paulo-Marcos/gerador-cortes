// D-154: camada de I/O (react-query) do gerenciador de canais. Mantém a página
// "burra" — o componente só consome estes hooks, sem tocar em fetch direto.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import { paraComponentesDoPalco } from './palcoDoCanal';
import {
  channelsApi,
  palcoApi,
  themesApi,
  youtubeAuthApi,
  type CriarCanalRequest,
  type IdentidadeCanal,
  type ListaCanaisResponse,
  type ListaTemasResponse,
  type PalcoComponentes,
  type PalcoComponentesEdicao,
  type TemaSelecionado,
  type YoutubeAuthStatus,
} from '@/features/channels/api/canais';

const CANAIS_KEY = ['canais'] as const;
const YOUTUBE_AUTH_KEY = ['youtube-auth-status'] as const;
const TEMAS_KEY = ['temas'] as const;
const temaDoCanalKey = (id: string) => ['tema-canal', id] as const;

export function useCanais() {
  return useQuery<ListaCanaisResponse>({
    queryKey: CANAIS_KEY,
    queryFn: channelsApi.listar,
    staleTime: 5_000,
  });
}

export function useCriarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CriarCanalRequest) => channelsApi.criar(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CANAIS_KEY }),
  });
}

export function useSelecionarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => channelsApi.selecionar(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CANAIS_KEY });
      // D-629: o aviso "reinicie para trocar de canal" aparece na hora, não no próximo poll.
      void qc.invalidateQueries({ queryKey: ['sincronizacao'] });
    },
  });
}

export function useEditarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, identidade }: { id: string; identidade: IdentidadeCanal }) =>
      channelsApi.editar(id, identidade),
    onSuccess: () => qc.invalidateQueries({ queryKey: CANAIS_KEY }),
  });
}

// ─── Tema de render por canal (D-174) ──────────────────────────────────

/** Biblioteca versionada de temas (default do backend) — estável, cache longo. */
export function useTemas() {
  return useQuery<ListaTemasResponse>({
    queryKey: TEMAS_KEY,
    queryFn: themesApi.listar,
    staleTime: Infinity,
  });
}

/** Tema selecionado de um canal (default `atual` quando nunca escolheu). */
export function useTemaDoCanal(canalId: string | undefined) {
  return useQuery<TemaSelecionado>({
    queryKey: temaDoCanalKey(canalId ?? ''),
    queryFn: () => themesApi.obterDoCanal(canalId as string),
    enabled: Boolean(canalId),
  });
}

export function useSelecionarTema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ canalId, temaId }: { canalId: string; temaId: string }) =>
      themesApi.selecionar(canalId, temaId),
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: temaDoCanalKey(data.canal_id) }),
  });
}

// ─── Conexão OAuth do YouTube do canal ativo (D-169) ───────────────────

/**
 * Status da conexão do YouTube. Enquanto um login está em andamento
 * (`fluxo_em_andamento`), refaz o poll a cada 2s para detectar a conclusão;
 * fora disso, não fica pollando.
 */
export function useYoutubeAuthStatus() {
  return useQuery<YoutubeAuthStatus>({
    queryKey: YOUTUBE_AUTH_KEY,
    queryFn: youtubeAuthApi.status,
    refetchInterval: (query) => (query.state.data?.fluxo_em_andamento ? 2_000 : false),
  });
}

export function useConectarYoutube() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => youtubeAuthApi.conectar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: YOUTUBE_AUTH_KEY }),
  });
}

export function useDesconectarYoutube() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => youtubeAuthApi.desconectar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: YOUTUBE_AUTH_KEY }),
  });
}

// ─── Componentes do palco por canal (D-911) ────────────────────────────

const palcoDoCanalKey = (id: string) => ['palco-canal', id] as const;

export function usePalcoDoCanal(canalId: string | undefined) {
  return useQuery<PalcoComponentes>({
    queryKey: palcoDoCanalKey(canalId ?? ''),
    queryFn: () => palcoApi.obter(canalId ?? ''),
    enabled: Boolean(canalId),
    staleTime: 5_000,
  });
}

/** Os componentes do palco do canal ATIVO — o que as prévias desenham. */
export function usePalcoDoCanalAtivo() {
  const canais = useCanais();
  const ativo = canais.data?.canais.find((c) => c.ativo);
  return usePalcoDoCanal(ativo?.id);
}

/** O mesmo, já resolvido para o que o palco desenha (estável entre renders). */
export function usePalcoDoCanalAtivoResolvido(): ComponentesDoPalco {
  const { data } = usePalcoDoCanalAtivo();
  return useMemo(() => paraComponentesDoPalco(data), [data]);
}

export function useGravarPalco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ canalId, edicao }: { canalId: string; edicao: PalcoComponentesEdicao }) =>
      palcoApi.gravar(canalId, edicao),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: palcoDoCanalKey(data.canal_id) }),
  });
}

export function useEnviarImagemDoPalco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ canalId, arquivo }: { canalId: string; arquivo: File }) =>
      palcoApi.enviarImagem(canalId, arquivo),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: palcoDoCanalKey(data.canal_id) }),
  });
}

export function useRemoverImagemDoPalco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (canalId: string) => palcoApi.removerImagem(canalId),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: palcoDoCanalKey(data.canal_id) }),
  });
}
