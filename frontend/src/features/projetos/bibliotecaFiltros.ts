import type { Projeto } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// Filtros e ordenação da Biblioteca.
//
// Extraídos de `ProjetosPage` em D-599 porque a Biblioteca passou a ter
// duas apresentações (a atual e a do upgrade de layout) e um critério de
// filtro duplicado é um critério que um dia diverge — o operador veria
// "Editando 2" numa tela e "Editando 3" na outra, sem saber qual crer.
// Regra e comentários vieram inalterados.
// ─────────────────────────────────────────────────────────────

export type FilterKey = 'todos' | 'nao_publicados' | 'analise' | 'edicao' | 'publicados' | 'nao_limpos';

export const FILTERS: Array<{
  key: FilterKey;
  label: string;
  matches: (projeto: Projeto) => boolean;
}> = [
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
  {
    // D-399: fila de manutenção de disco — projetos cuja mídia pesada ainda
    // ocupa espaço. Isola quem pode ser limpo sem caçar card a card.
    key: 'nao_limpos',
    label: 'Nao limpos',
    matches: (projeto) => !projeto.arquivos_limpos,
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

export function sortProjetosPorPublicacao(a: Projeto, b: Projeto) {
  const dataDiff = dataPublicacaoMs(b.data_live || '') - dataPublicacaoMs(a.data_live || '');
  if (dataDiff !== 0) return dataDiff;

  return (b.criado_em || '').localeCompare(a.criado_em || '');
}

export type SortKey = 'recentes' | 'antigos' | 'titulo';

// DE-PARA-v2 §1: ordenação da grid, ausente na implementação. "Mais
// recentes" é o sort_key default (o mesmo já aplicado incondicionalmente
// antes desta mudança) — os demais são o mínimo útil pra tornar o seletor
// funcional sem inventar critério que a PROD não descreveu.
export const SORTS: Array<{
  key: SortKey;
  label: string;
  compare: (a: Projeto, b: Projeto) => number;
}> = [
  { key: 'recentes', label: 'Mais recentes', compare: sortProjetosPorPublicacao },
  { key: 'antigos', label: 'Mais antigos', compare: (a, b) => -sortProjetosPorPublicacao(a, b) },
  {
    key: 'titulo',
    label: 'Título (A-Z)',
    compare: (a, b) => a.titulo_live.localeCompare(b.titulo_live, 'pt-BR'),
  },
];

/** Aplica filtro, busca por título e ordenação — a regra que as duas telas dividem. */
export function filtrarProjetos(
  projetos: Projeto[],
  { filtro, busca, ordem }: { filtro: FilterKey; busca: string; ordem: SortKey },
): Projeto[] {
  const termo = busca.trim().toLowerCase();
  const ativo = FILTERS.find((item) => item.key === filtro) ?? FILTERS[0];
  const compare = SORTS.find((item) => item.key === ordem)?.compare ?? sortProjetosPorPublicacao;

  return projetos
    .filter(ativo.matches)
    .filter((projeto) => !termo || projeto.titulo_live.toLowerCase().includes(termo))
    .slice()
    .sort(compare);
}

/** Quantos projetos cada filtro pegaria — o número ao lado do rótulo. */
export function contarPorFiltro(projetos: Projeto[]): Record<FilterKey, number> {
  return Object.fromEntries(
    FILTERS.map((item) => [item.key, projetos.filter(item.matches).length]),
  ) as Record<FilterKey, number>;
}
