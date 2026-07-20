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

type SortKey = 'recentes' | 'antigos' | 'titulo';

// DE-PARA-v2 §1: ordenação da grid, ausente na implementação. "Mais
// recentes" é o sort_key default (o mesmo já aplicado incondicionalmente
// antes desta mudança) — os demais são o mínimo útil pra tornar o seletor
// funcional sem inventar critério que a PROD não descreveu.
const SORTS: Array<{ key: SortKey; label: string; compare: (a: Projeto, b: Projeto) => number }> = [
  { key: 'recentes', label: 'Mais recentes', compare: sortProjetosPorPublicacao },
  { key: 'antigos', label: 'Mais antigos', compare: (a, b) => -sortProjetosPorPublicacao(a, b) },
  {
    key: 'titulo',
    label: 'Título (A-Z)',
    compare: (a, b) => a.titulo_live.localeCompare(b.titulo_live, 'pt-BR'),
  },
];

export function ProjetosPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { data: projetos, isLoading, isError, error, refetch, isFetching } = useProjetos();
  const reiniciar = useReiniciarFalhados();
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('todos');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recentes');

  const allProjects = useMemo(() => projetos ?? [], [projetos]);
  const falhadosVisivel = useMemo(() => temFalhados(allProjects), [allProjects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const activeFilter = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
    const compare = SORTS.find((item) => item.key === sortKey)?.compare ?? sortProjetosPorPublicacao;

    return allProjects
      .filter(activeFilter.matches)
      .filter((projeto) => {
        if (!normalizedQuery) return true;
        return projeto.titulo_live.toLowerCase().includes(normalizedQuery);
      })
      .slice()
      .sort(compare);
  }, [filter, query, sortKey, allProjects]);

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
      {/* Header editorial (DE-PARA-v2 §1): eyebrow + contador (linha 1, com
          as ações primárias), headline serif itálico (linha 2), busca larga
          + filtros + ordenação (linha 3) — restaura o cabeçalho de PROD que
          a versão compacta tinha perdido. */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-code text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
              Biblioteca de lives
            </span>
            <span className="text-[var(--wb-text-dim)]" aria-hidden>
              —
            </span>
            <span className="text-[11px] font-semibold text-[var(--wb-text-dim)]">
              {allProjects.length} {allProjects.length === 1 ? 'projeto' : 'projetos'}
            </span>
          </div>

          {isFetching && !isLoading && (
            <Loader2
              size={14}
              className="animate-spin text-[var(--wb-text-dim)]"
              aria-label="Atualizando"
            />
          )}

          <div className="flex-1" />

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
        </div>

        <h1 className="font-editorial text-[32px] italic leading-tight text-[var(--wb-text)]">
          Cada live, um arquivo de cortes possíveis.
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 w-[280px] flex-none items-center gap-2 rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 text-xs text-[var(--wb-text-mute)]">
            <Search size={13} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar projetos…"
              className="min-w-0 flex-1 bg-transparent text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
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

          <div className="flex-1" />

          <div className="relative">
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              aria-label="Ordenar projetos"
              className="h-8 appearance-none rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] py-1 pl-7 pr-7 text-[11px] font-semibold text-[var(--wb-text)] outline-none"
            >
              {SORTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <SlidersHorizontal
              size={12}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--wb-text-dim)]"
              aria-hidden
            />
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--wb-text-dim)]"
              aria-hidden
            />
          </div>
        </div>
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
