import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Plus, RefreshCw, Search, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { temFalhados, useProjetos, useReiniciarFalhados } from '@/hooks/useProjetos';
import type { Projeto } from '@/types/models';
import { EmptyState } from './EmptyState';
import { NovoProjetoForm } from './NovoProjetoForm';
import { ProjetoCard } from './ProjetoCard';
import { ProjetoCardSkeleton } from './ProjetoCardSkeleton';

type FilterKey = 'todos' | 'nao_publicados' | 'analise' | 'edicao' | 'publicados';

const FILTERS: Array<{ key: FilterKey; label: string; matches: (projeto: Projeto) => boolean }> = [
  { key: 'todos', label: 'Todos', matches: () => true },
  {
    // F-059: backlog de trabalho — nenhum corte ainda foi para a nuvem/YouTube
    // (total_publicados conta cortes com youtube_video_id preenchido).
    key: 'nao_publicados',
    label: 'Nao publicados',
    matches: (projeto) => projeto.total_publicados === 0,
  },
  {
    key: 'analise',
    label: 'Em analise',
    matches: (projeto) => ['pronto', 'analisando'].includes(projeto.status),
  },
  {
    key: 'edicao',
    label: 'Editando',
    matches: (projeto) =>
      projeto.status === 'analisado' &&
      projeto.total_cortes > 0 &&
      projeto.total_publicados < projeto.total_cortes,
  },
  {
    key: 'publicados',
    label: 'Publicados',
    matches: (projeto) =>
      projeto.total_cortes > 0 && projeto.total_publicados === projeto.total_cortes,
  },
];

function dataPublicacaoMs(dataLive: string): number {
  const value = dataLive.trim();
  const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/);

  if (compactMatch) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = compactMatch;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortProjetosPorPublicacao(a: Projeto, b: Projeto) {
  const dataDiff = dataPublicacaoMs(b.data_live || '') - dataPublicacaoMs(a.data_live || '');
  if (dataDiff !== 0) return dataDiff;

  return (b.criado_em || '').localeCompare(a.criado_em || '');
}

export function ProjetosPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { data: projetos, isLoading, isError, error, refetch, isFetching } = useProjetos();
  const reiniciar = useReiniciarFalhados();
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('todos');
  const [query, setQuery] = useState('');

  const allProjects = useMemo(() => projetos ?? [], [projetos]);
  const falhadosVisivel = useMemo(() => temFalhados(allProjects), [allProjects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const activeFilter = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];

    return allProjects
      .filter(activeFilter.matches)
      .filter((projeto) => {
        if (!normalizedQuery) return true;
        return `${projeto.titulo_live} ${projeto.canal_origem}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice()
      .sort(sortProjetosPorPublicacao);
  }, [filter, query, allProjects]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((item) => [item.key, allProjects.filter(item.matches).length]),
      ) as Record<FilterKey, number>,
    [allProjects],
  );

  const onExplorar = () => navigate('/buscar-lives');
  const onCreate = () => setFormOpen(true);

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      {/* Header compacto do Workbench (protótipo §Biblioteca): título +
          chips de filtro com contagem + busca + ações na mesma linha. */}
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-[15px] font-extrabold">Biblioteca</h1>

        <div className="ml-2 flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={
                item.key === filter
                  ? 'rounded-md bg-[var(--wb-accent)] px-2.5 py-1 text-[10px] font-bold text-[var(--wb-accent-fg)]'
                  : 'rounded-md bg-[var(--wb-bg-inset)] px-2.5 py-1 text-[10px] font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]'
              }
            >
              {item.label} {counts[item.key]}
            </button>
          ))}
        </div>

        {isFetching && !isLoading && (
          <Loader2
            size={14}
            className="animate-spin text-[var(--wb-text-dim)]"
            aria-label="Atualizando"
          />
        )}

        <div className="flex-1" />

        <label className="flex h-8 min-w-[190px] items-center gap-2 rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 text-xs text-[var(--wb-text-mute)]">
          <Search size={13} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="buscar live ou canal…"
            className="min-w-0 flex-1 bg-transparent text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
          />
        </label>

        {falhadosVisivel && (
          <button
            type="button"
            onClick={() =>
              reiniciar.mutate(undefined, {
                onSuccess: (data) => {
                  if (data.total === 0) {
                    notify('Nenhum projeto com falha de download para reiniciar.', {
                      tone: 'info',
                    });
                  } else {
                    notify(`${data.total} download(s) reiniciado(s).`, { tone: 'success' });
                  }
                },
                onError: (err) =>
                  notify(err instanceof Error ? err.message : 'Erro ao reiniciar downloads.', {
                    tone: 'error',
                  }),
              })
            }
            disabled={reiniciar.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--wb-warn-soft)] px-3 py-1.5 text-[10.5px] font-bold text-[var(--wb-warn)] disabled:opacity-60"
          >
            {reiniciar.isPending ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={12} aria-hidden />
            )}
            reiniciar falhados
          </button>
        )}
        <Button variant="outline" size="sm" onClick={onExplorar}>
          <Youtube />
          Explorar YouTube
        </Button>
        <Button size="sm" onClick={onCreate}>
          <Plus />
          Novo projeto
        </Button>
      </header>

      <NovoProjetoForm open={formOpen} onClose={() => setFormOpen(false)} />

      {isError && (
        <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">Nao foi possivel carregar a lista real</p>
            <p className="text-xs opacity-80">{(error as Error).message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {isLoading &&
          Array.from({ length: 8 }).map((_, index) => <ProjetoCardSkeleton key={index} />)}

        {!isLoading && filteredProjects.length === 0 && (
          <EmptyState onCreate={onCreate} onExplorar={onExplorar} />
        )}

        {!isLoading &&
          filteredProjects.map((projeto, index) => (
            <ProjetoCard key={projeto.id} projeto={projeto} index={index} />
          ))}
      </div>
    </div>
  );
}
