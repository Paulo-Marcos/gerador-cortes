// D-154: camada de I/O (react-query) do gerenciador de canais. Mantém a página
// "burra" — o componente só consome estes hooks, sem tocar em fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  channelsApi,
  youtubeAuthApi,
  type CriarCanalRequest,
  type IdentidadeCanal,
  type ListaCanaisResponse,
  type YoutubeAuthStatus,
} from '@/lib/channelsApi';

const CANAIS_KEY = ['canais'] as const;
const YOUTUBE_AUTH_KEY = ['youtube-auth-status'] as const;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: CANAIS_KEY }),
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
