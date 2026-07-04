import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Youtube,
} from 'lucide-react';
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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-[var(--wb-border-soft)] px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--wb-text-mute)]">
                Biblioteca de lives
              </span>
              <span className="h-px w-6 bg-[var(--wb-border)]" aria-hidden />
              <span className="font-code text-xs text-[var(--wb-text-dim)]">
                {allProjects.length} projetos
              </span>
              {isFetching && !isLoading && (
                <Loader2
                  size={14}
                  className="animate-spin text-[var(--wb-text-dim)]"
                  aria-label="Atualizando"
                />
              )}
            </div>
            <h1 className="m-0 max-w-4xl font-editorial text-[48px] font-normal italic leading-none tracking-[-0.025em] text-[var(--wb-text)]">
              Cada live, um arquivo de cortes possíveis.
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {falhadosVisivel && (
              <Button
                variant="ghost"
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
              >
                {reiniciar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Reiniciar falhados
              </Button>
            )}
            <Button variant="outline" onClick={onExplorar}>
              <Youtube />
              Explorar YouTube
            </Button>
            <Button onClick={onCreate}>
              <Plus />
              Novo projeto
            </Button>
          </div>
        </div>
      </header>

      <NovoProjetoForm open={formOpen} onClose={() => setFormOpen(false)} />

      <section className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm text-[var(--wb-text-mute)] sm:max-w-sm">
            <Search size={14} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar projetos..."
              className="min-w-0 flex-1 bg-transparent text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
            />
          </label>

          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={
                item.key === filter
                  ? 'inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-ink)] bg-[var(--wb-ink)] px-3 text-xs font-semibold text-[var(--wb-ink-fg)]'
                  : 'inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-transparent px-3 text-xs font-semibold text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]'
              }
            >
              {item.label}
              <span className="font-code text-[11px] opacity-70">{counts[item.key]}</span>
            </button>
          ))}

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              notify('Ordenacao personalizada entra na proxima etapa.', { tone: 'info' })
            }
          >
            <SlidersHorizontal />
            Mais recentes
            <ChevronDown />
          </Button>
        </div>
      </section>

      <section className="flex-1 px-6 py-6 sm:px-10">
        <div className="mx-auto max-w-[1680px]">
          {isError && (
            <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-sm)] border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      </section>
    </div>
  );
}
