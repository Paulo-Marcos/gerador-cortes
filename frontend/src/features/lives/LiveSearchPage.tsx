import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Selo } from '@/components/ui/selo';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { useToast } from '@/components/ui/toaster';
import { livesApi, type YoutubeLive, type YoutubeLivesResponse } from './api';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { Icon } from '@/upgrade/Icon';

const DEFAULT_AFTER_DATE = '2026-05-01';

function toApiDate(date: string) {
  return date.replaceAll('-', '');
}

function formatPublishedAt(iso: string) {
  if (!iso) return 'sem data';
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
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

function hueFromId(id: string) {
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

export function LiveSearchPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [afterDate, setAfterDate] = useState(DEFAULT_AFTER_DATE);
  const [channel, setChannel] = useState(import.meta.env.VITE_CANAL_HANDLE ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useState({
    afterDate: toApiDate(DEFAULT_AFTER_DATE),
    max: 25,
  });

  const livesKey = ['youtube-lives', searchParams] as const;
  const livesQuery = useQuery({
    queryKey: livesKey,
    queryFn: () => livesApi.listarLivesCanal(searchParams.afterDate, searchParams.max),
  });

  const lives = useMemo(() => livesQuery.data?.lives ?? [], [livesQuery.data]);
  const selectedLives = useMemo(
    () => lives.filter((live) => selectedIds.has(live.video_id)),
    [lives, selectedIds],
  );

  useEffect(() => {
    if (!livesQuery.data) return;
    setSelectedIds(
      new Set(
        livesQuery.data.lives.filter((live) => !live.ja_baixado).map((live) => live.video_id),
      ),
    );
  }, [livesQuery.data]);

  const enqueueMutation = useMutation({
    mutationFn: (ids: string[]) => livesApi.enfileirarDownloads(ids, channel),
    onSuccess: (res) => {
      const createdIds = new Set(res.criados.map((item) => item.video_id));
      queryClient.setQueryData<YoutubeLivesResponse>(livesKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          lives: current.lives.map((live) => ({
            ...live,
            ja_baixado: live.ja_baixado || createdIds.has(live.video_id),
          })),
        };
      });
      setSelectedIds(new Set());
      notify(`${res.criados.length} projeto(s) criado(s) e pipeline iniciado.`, {
        tone: res.criados.length > 0 ? 'success' : 'info',
      });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao enfileirar lives.', {
        tone: 'error',
      });
    },
  });

  const searchLives = () => {
    const next = { afterDate: toApiDate(afterDate), max: 25 };
    setSearchParams(next);
    if (next.afterDate === searchParams.afterDate) void livesQuery.refetch();
  };

  const toggleLive = (live: YoutubeLive) => {
    if (live.ja_baixado) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(live.video_id)) next.delete(live.video_id);
      else next.add(live.video_id);
      return next;
    });
  };

  const selectNotDownloaded = () => {
    setSelectedIds(new Set(lives.filter((live) => !live.ja_baixado).map((live) => live.video_id)));
    notify('Lives nao baixadas selecionadas.', { tone: 'info' });
  };

  const processSelected = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    enqueueMutation.mutate(ids);
  };

  // D-599: na casca nova o cabecalho da tela e da CASCA. Manter o proprio
  // deixaria dois titulos identicos empilhados na mesma janela.
  useDefinirChrome(
    {
      sub: `${lives.length} lives encontradas · ${lives.filter((live) => live.ja_baixado).length} já no app`,
    },
    [lives],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-auto px-7 py-6 text-fg">
      <FiltrosDaBusca
        afterDate={afterDate}
        onData={setAfterDate}
        channel={channel}
        onCanal={setChannel}
        buscando={livesQuery.isFetching}
        onBuscar={searchLives}
      />

      {selectedLives.length > 0 && (
        <BarraDeSelecao
          selecionadas={selectedLives}
          processando={enqueueMutation.isPending}
          onDesmarcar={() => setSelectedIds(new Set())}
          onProcessar={processSelected}
        />
      )}

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <span className="text-corpo text-fg-2">
            {livesQuery.isLoading ? 'Buscando lives…' : `${lives.length} live(s) encontrada(s)`}
          </span>
          <div className="flex-1" />
          {lives.length > 0 && (
            <Button type="button" variant="secundario" size="pq" onClick={selectNotDownloaded}>
              <Icon name="check" />
              Selecionar não baixadas
            </Button>
          )}
        </div>

        {livesQuery.isLoading && <EstadoCarregando frase="Buscando as lives do canal-fonte…" linhas={2} />}

        {livesQuery.isError && (
          <EstadoDeErro
            titulo="Não foi possível buscar as lives"
            motivo={livesQuery.error instanceof Error ? livesQuery.error.message : undefined}
            aoTentar={() => void livesQuery.refetch()}
          />
        )}

        {!livesQuery.isLoading && lives.length === 0 && !livesQuery.isError && (
          <EstadoVazio
            icone="radio"
            titulo="Nenhuma live encontrada"
            descricao="Ajuste a data ou confira a configuração do canal no backend."
          />
        )}

        {lives.length > 0 && (
          <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">
            <Tabela>
              <TabelaCabeca>
                <TabelaLinha>
                  <TabelaTitulo>
                    <span className="sr-only">Selecionar</span>
                  </TabelaTitulo>
                  <TabelaTitulo>Live</TabelaTitulo>
                  <TabelaTitulo>Publicada em</TabelaTitulo>
                  <TabelaTitulo aDireita>Duração</TabelaTitulo>
                  <TabelaTitulo>Situação</TabelaTitulo>
                  <TabelaTitulo>
                    <span className="sr-only">Ações</span>
                  </TabelaTitulo>
                </TabelaLinha>
              </TabelaCabeca>
              <TabelaCorpo>
                {lives.map((live) => (
                  <LiveRow
                    key={live.video_id}
                    live={live}
                    selected={selectedIds.has(live.video_id)}
                    onToggle={() => toggleLive(live)}
                  />
                ))}
              </TabelaCorpo>
            </Tabela>
          </div>
        )}
      </section>
    </div>
  );
}

function FiltrosDaBusca(props: {
  afterDate: string;
  onData: (v: string) => void;
  channel: string;
  onCanal: (v: string) => void;
  buscando: boolean;
  onBuscar: () => void;
}) {
  return (
    <section className="flex flex-wrap items-end gap-4 rounded-cartao border border-fio bg-vidro p-5">
      <Field rotulo="Lives após a data" className="w-[200px]">
        <Input aparencia="sala" type="date" value={props.afterDate} onChange={(e) => props.onData(e.target.value)} />
      </Field>
      <Field rotulo="Canal de origem" className="w-[260px]">
        <Input aparencia="sala" value={props.channel} onChange={(e) => props.onCanal(e.target.value)} />
      </Field>
      <Button type="button" variant="secundario" carregando={props.buscando} onClick={props.onBuscar}>
        <Icon name="search" />
        {props.buscando ? 'Buscando…' : 'Buscar lives'}
      </Button>
    </section>
  );
}

export function BarraDeSelecao(props: {
  selecionadas: YoutubeLive[];
  processando: boolean;
  onDesmarcar: () => void;
  onProcessar: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-iris-fio bg-iris-suave px-5 py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-corpo font-semibold text-fg">
          {props.selecionadas.length} live(s) selecionada(s)
        </strong>
        <span className="text-pequeno text-fg-2">O pipeline começa sozinho depois do download.</span>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secundario" onClick={props.onDesmarcar}>
          Desmarcar todas
        </Button>
        <Button type="button" variant="primario" carregando={props.processando} onClick={props.onProcessar}>
          <Icon name="download" />
          {props.processando ? 'Baixando…' : 'Baixar e processar'}
        </Button>
      </div>
    </section>
  );
}

function LiveRow({
  live,
  selected,
  onToggle,
}: {
  live: YoutubeLive;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <TabelaLinha>
      <TabelaCelula className="w-10 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          disabled={live.ja_baixado}
          aria-label={selected ? 'Desmarcar live' : 'Selecionar live'}
        />
      </TabelaCelula>
      <TabelaCelula className={live.ja_baixado ? 'opacity-70' : undefined}>
        <div className="flex min-w-0 items-center gap-3 py-2">
          <div className="w-[116px] shrink-0 overflow-hidden rounded-etiqueta border border-fio bg-poco">
            {live.thumbnail_url ? (
              <img src={live.thumbnail_url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
            ) : (
              <ThumbnailPlaceholder hue={hueFromId(live.video_id)} />
            )}
          </div>
          <span className="line-clamp-2 text-corpo font-semibold text-fg">{live.titulo}</span>
        </div>
      </TabelaCelula>
      <TabelaCelula className="whitespace-nowrap text-fg-2">{formatPublishedAt(live.data_publicacao)}</TabelaCelula>
      <TabelaCelula numero aDireita className="text-fg-2">
        {formatDuration(live.duracao_iso)}
      </TabelaCelula>
      <TabelaCelula>{live.ja_baixado ? <Selo tom="ok">baixada</Selo> : <Selo tom="neutro">nova</Selo>}</TabelaCelula>
      <TabelaCelula className="text-right">
        <Button asChild variant="fantasma" size="pq">
          <a href={live.youtube_url} target="_blank" rel="noreferrer">
            <Icon name="external-link" />
            Ver
          </a>
        </Button>
      </TabelaCelula>
    </TabelaLinha>
  );
}
