import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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

export function FiltroDoCanal() {
  // As mesmas chaves das configurações e da Revisão: o cache é um só.
  const settings = useQuery({ queryKey: ['app-settings'], queryFn: settingsApi.obterSettings });
  const filtros = useQuery({ queryKey: ['export-filtros'], queryFn: () => filtrosApi.listarFiltros() });
  const nome = nomeDoFiltroDoCanal(settings.data?.filtro_global_padrao, filtros.data?.filtros);

  return (
    <p
      data-testid="filtro-do-canal"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2 text-[12px] text-[var(--wb-text-mute)]"
    >
      <Icon name="sliders-horizontal" />
      <span>Filtro do canal (global):</span>
      <strong className="font-semibold text-[var(--wb-text)]">{nome ?? 'carregando…'}</strong>
      <Link
        to={CAMINHO_DO_FILTRO_DO_CANAL}
        className="ml-auto text-[var(--wb-accent)] underline-offset-2 hover:underline"
      >
        Alterar em Canais → Aplicação
      </Link>
    </p>
  );
}
