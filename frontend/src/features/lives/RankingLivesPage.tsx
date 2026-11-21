import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { livesApi, type RankingLive, type RankingLivesResponse } from './api';
import { RankingEmbasamentoPanel } from './RankingEmbasamentoPanel';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { Icon } from '@/upgrade/Icon';

function formatPublishedAt(iso: string) {
  if (!iso) return 'sem data';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(iso: string) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso || 'sem duracao';
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatRelative(iso: string) {
  if (!iso) return 'nunca';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const horas = Math.max(0, Math.round(diffMs / 3_600_000));
    if (horas < 1) return 'agora há pouco';
    if (horas < 24) return `há ${horas}h`;
    return `há ${Math.round(horas / 24)}d`;
  } catch {
    return iso;
  }
}

function hueFromId(id: string) {
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

const COMPONENTE_LABEL: Record<string, string> = {
  views: 'Audiência',
  likes_por_view: 'Likes (taxa)',
  comentarios_por_view: 'Comentários (taxa)',
  sentimento: 'Tom do público',
  recencia: 'Recência',
  vph: 'Momento (v/h)',
};

/** A consulta do ranking e as ações sobre ele (atualizar, rejeitar, baixar). */
function useRanking() {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const rankingKey = ['ranking-lives'] as const;
  const rankingQuery = useQuery({
    queryKey: rankingKey,
    queryFn: () => livesApi.listarRankingLives(false),
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => livesApi.refreshRankingLives(),
    onSuccess: (data) => {
      queryClient.setQueryData<RankingLivesResponse>(rankingKey, data);
      notify('Ranking atualizado.', { tone: 'success' });
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : 'Falha ao atualizar ranking.', {
        tone: 'error',
      });
    },
  });

  const rejeitarMutation = useMutation({
    mutationFn: (videoId: string) => livesApi.rejeitarCandidata(videoId),
    onSuccess: (_data, videoId) => {
      queryClient.setQueryData<RankingLivesResponse>(rankingKey, (current) =>
        current
          ? { ...current, lives: current.lives.filter((l) => l.video_id !== videoId) }
          : current,
      );
      notify('Live rejeitada — a próxima da fila assume a vaga ao atualizar.', {
        tone: 'info',
      });
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : 'Falha ao rejeitar.', { tone: 'error' });
    },
  });

  const baixarMutation = useMutation({
    mutationFn: (videoId: string) => livesApi.enfileirarCandidata(videoId),
    onSuccess: (data, videoId) => {
      queryClient.setQueryData<RankingLivesResponse>(rankingKey, (current) =>
        current
          ? { ...current, lives: current.lives.filter((l) => l.video_id !== videoId) }
          : current,
      );
      // Fica na tela de ranking (sem navigate): o usuário pode encadear vários
      // downloads em seguida sem perder a lista.
      notify(
        data.ja_existia
          ? 'Já havia projeto para essa live.'
          : 'Download iniciado — vai aparecer em Projetos.',
        { tone: 'success' },
      );
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : 'Falha ao baixar.', { tone: 'error' });
    },
  });

  return { rankingQuery, refreshMutation, rejeitarMutation, baixarMutation };
}

export function RankingLivesPage() {
  const navigate = useNavigate();
  const { rankingQuery, refreshMutation, rejeitarMutation, baixarMutation } = useRanking();
  const lives = useMemo(() => rankingQuery.data?.lives ?? [], [rankingQuery.data]);
  const atualizadoEm = rankingQuery.data?.atualizado_em ?? '';
  const janelaMeses = rankingQuery.data?.janela_meses;
  const [comEmbasamento, setComEmbasamento] = useState<RankingLive | null>(null);

  useDefinirChrome(
    {
      sub: `top ${lives.length} · audiência · engajamento · tom dos comentários · recência`,
      acoes: [
        {
          icone: 'sliders-horizontal',
          texto: 'Pesos do ranking',
          onClick: () => navigate('/canais'),
        },
        {
          icone: refreshMutation.isPending ? 'loader' : 'rotate-ccw',
          texto: 'Atualizar ranking',
          onClick: () => refreshMutation.mutate(),
        },
      ],
    },
    [lives.length, refreshMutation.isPending],
  );

  const gerando = (rankingQuery.isLoading || refreshMutation.isPending) && lives.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-auto px-7 py-6 text-fg">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-pequeno text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="sparkles" />
          Atualizado {formatRelative(atualizadoEm)}
        </span>
        {janelaMeses && (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="calendar" />
            Janela de {janelaMeses} {janelaMeses === 1 ? 'mês' : 'meses'}
          </span>
        )}
      </p>

      {rankingQuery.isError && (
        <EstadoDeErro
          titulo="Não foi possível carregar o ranking"
          motivo={rankingQuery.error instanceof Error ? rankingQuery.error.message : undefined}
          aoTentar={() => void rankingQuery.refetch()}
        />
      )}

      {gerando && (
        <EstadoCarregando
          frase="Gerando o ranking (busca + sentimento via Claude). Pode levar alguns minutos na primeira vez."
          linhas={2}
        />
      )}

      {!rankingQuery.isLoading && !gerando && lives.length === 0 && !rankingQuery.isError && (
        <EstadoVazio
          icone="trophy"
          titulo="Nenhuma candidata pendente"
          descricao="Use “Atualizar ranking” para buscar as lives recentes do canal-fonte."
        />
      )}

      {lives.length > 0 && (
        <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">
          <Tabela>
            <TabelaCabeca>
              <TabelaLinha>
                <TabelaTitulo aDireita>#</TabelaTitulo>
                <TabelaTitulo>Live</TabelaTitulo>
                <TabelaTitulo aDireita>Views</TabelaTitulo>
                <TabelaTitulo aDireita>Likes</TabelaTitulo>
                <TabelaTitulo aDireita>Comentários</TabelaTitulo>
                <TabelaTitulo aDireita>Tom</TabelaTitulo>
                <TabelaTitulo>Pontuação</TabelaTitulo>
                <TabelaTitulo>
                  <span className="sr-only">Ações</span>
                </TabelaTitulo>
              </TabelaLinha>
            </TabelaCabeca>
            <TabelaCorpo>
              {lives.map((live, idx) => (
                <RankingRow
                  key={live.video_id}
                  live={live}
                  posicao={idx + 1}
                  onBaixar={() => baixarMutation.mutate(live.video_id)}
                  onRejeitar={() => rejeitarMutation.mutate(live.video_id)}
                  onEntender={() => setComEmbasamento(live)}
                  baixando={baixarMutation.isPending && baixarMutation.variables === live.video_id}
                  rejeitando={rejeitarMutation.isPending && rejeitarMutation.variables === live.video_id}
                />
              ))}
            </TabelaCorpo>
          </Tabela>
        </div>
      )}

      {comEmbasamento && (
        <RankingEmbasamentoPanel
          titulo={comEmbasamento.titulo}
          pontuacaoTotal={comEmbasamento.pontuacao_total}
          embasamento={comEmbasamento.embasamento}
          destaques={comEmbasamento.sentimento_destaques}
          onClose={() => setComEmbasamento(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  live: RankingLive;
  posicao: number;
  onBaixar: () => void;
  onRejeitar: () => void;
  onEntender: () => void;
  baixando: boolean;
  rejeitando: boolean;
}

const CELULA = 'py-3 align-middle';

function DadosDaLive({ live }: { live: RankingLive }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="w-[116px] shrink-0 overflow-hidden rounded-etiqueta border border-fio bg-poco">
        {live.thumbnail_url ? (
          <img src={live.thumbnail_url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
        ) : (
          <ThumbnailPlaceholder hue={hueFromId(live.video_id)} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="line-clamp-2 text-corpo font-semibold text-fg">{live.titulo}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-pequeno text-fg-3">
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" />
            {formatPublishedAt(live.data_publicacao)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" />
            {formatDuration(live.duracao_iso)}
          </span>
        </span>
        {live.sentimento_destaques.length > 0 && (
          <span className="line-clamp-1 border-l-2 border-iris-fio pl-2 text-pequeno italic text-fg-2">
            “{live.sentimento_destaques[0]}”
          </span>
        )}
      </div>
    </div>
  );
}

function PontuacaoDaLive({ live }: { live: RankingLive }) {
  const score = Math.round(live.pontuacao_total);
  const breakdown = Object.entries(live.componentes_pontuacao)
    .map(([k, v]) => `${COMPONENTE_LABEL[k] ?? k}: ${Math.round(v)}`)
    .join(' · ');
  return (
    <Tooltip label={breakdown || 'Composição da pontuação'} side="left">
      <div className="flex w-[132px] items-center gap-2.5">
        <span className="num w-8 text-right text-linha font-bold text-fg">{score}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-vidro-3">
          <div className="h-full bg-iris" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
        </div>
      </div>
    </Tooltip>
  );
}

function AcoesDaLive({ live, onBaixar, onRejeitar, onEntender, baixando, rejeitando }: Omit<RowProps, 'posicao'>) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button asChild variant="fantasma" size="pq">
        <a href={live.youtube_url} target="_blank" rel="noreferrer">
          <Icon name="external-link" />
          Ver
        </a>
      </Button>
      {live.embasamento.length > 0 && (
        <Button type="button" variant="fantasma" size="pq" onClick={onEntender}>
          <Icon name="info" />
          Entenda a nota
        </Button>
      )}
      <Button type="button" variant="secundario" size="pq" onClick={onRejeitar} disabled={rejeitando || baixando} carregando={rejeitando}>
        <Icon name="x" />
        Rejeitar
      </Button>
      <Button type="button" variant="secundario" size="pq" onClick={onBaixar} disabled={baixando || rejeitando} carregando={baixando}>
        <Icon name="download" />
        Baixar
      </Button>
    </div>
  );
}

export function RankingRow(props: RowProps) {
  const { live, posicao } = props;
  return (
    <TabelaLinha>
      <TabelaCelula numero aDireita className={`${CELULA} text-fg-2`}>
        {posicao}
      </TabelaCelula>
      <TabelaCelula className={CELULA}>
        <DadosDaLive live={live} />
      </TabelaCelula>
      <TabelaCelula numero aDireita className={`${CELULA} text-fg-2`}>
        <Tooltip label={`${live.views.toLocaleString('pt-BR')} views`} side="top">
          <span>{formatNumber(live.views)}</span>
        </Tooltip>
      </TabelaCelula>
      <TabelaCelula numero aDireita className={`${CELULA} text-fg-2`}>
        <Tooltip label={`${live.likes.toLocaleString('pt-BR')} likes`} side="top">
          <span>{formatNumber(live.likes)}</span>
        </Tooltip>
      </TabelaCelula>
      <TabelaCelula numero aDireita className={`${CELULA} text-fg-2`}>
        <Tooltip label={`${live.comentarios.toLocaleString('pt-BR')} comentários`} side="top">
          <span>{formatNumber(live.comentarios)}</span>
        </Tooltip>
      </TabelaCelula>
      <TabelaCelula numero aDireita className={`${CELULA} text-fg-2`}>
        {live.sentimento_score.toFixed(1)}/10
      </TabelaCelula>
      <TabelaCelula className={CELULA}>
        <PontuacaoDaLive live={live} />
      </TabelaCelula>
      <TabelaCelula className={CELULA}>
        <AcoesDaLive {...props} />
      </TabelaCelula>
    </TabelaLinha>
  );
}
