import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { filtrosApi } from '@/features/post-production/api/filtros';
import { settingsApi } from '@/features/settings/api';
import { Icon } from '@/upgrade/Icon';

// D-1072 (RN-25): o filtro de render é do canal, um só para todos os cortes, e
// se edita em Canais → Aplicação. A Pós tinha uma aba Filtros que parecia
// escolher o filtro do corte; agora ela só diz qual filtro o render vai usar e
// leva a quem o edita.

export const CAMINHO_DO_FILTRO_DO_CANAL = '/canais?aba=aplicacao';

/** O nome do filtro global; sem o catálogo carregado, o id; sem nada, null. */
export function nomeDoFiltroDoCanal(
  filtroId: string | null | undefined,
  catalogo: ReadonlyArray<{ id: string; nome: string }> | undefined,
): string | null {
  if (!filtroId) return null;
  return catalogo?.find((f) => f.id === filtroId)?.nome ?? filtroId;
}

/**
 * D-1086: um chip na linha que já existe (as abas, o cabeçalho do painel), não uma
 * faixa fixa no pé da coluna: a faixa quebrava em duas linhas e tirava ~57 px da
 * lista de cenas. O nome do filtro fica à vista; o rótulo inteiro vai ao leitor de
 * tela e ao hover; o clique leva a quem edita.
 */
export function FiltroDoCanal({ className }: { className?: string }) {
  // As mesmas chaves das configurações e da Revisão: o cache é um só.
  const settings = useQuery({ queryKey: ['app-settings'], queryFn: settingsApi.obterSettings });
  const filtros = useQuery({ queryKey: ['export-filtros'], queryFn: () => filtrosApi.listarFiltros() });
  const nome = nomeDoFiltroDoCanal(settings.data?.filtro_global_padrao, filtros.data?.filtros) ?? 'carregando…';

  return (
    <Link
      to={CAMINHO_DO_FILTRO_DO_CANAL}
      data-testid="filtro-do-canal"
      title={`Filtro do canal (global): ${nome}. Alterar em Canais → Aplicação`}
      className={cn(
        'inline-flex min-w-0 max-w-[50%] items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11px] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-card)] hover:text-[var(--wb-text)]',
        className,
      )}
    >
      <Icon name="sliders-horizontal" className="shrink-0" />
      <span className="sr-only">Filtro do canal (global):</span>
      <span aria-hidden className="shrink-0">filtro</span>
      <strong className="truncate font-semibold text-[var(--wb-text)]">{nome}</strong>
    </Link>
  );
}
