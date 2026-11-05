import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { linhaDoCortePath } from '@/features/post-production/postProductionNavigation';
import { shortsApi, type AndamentoDaLive, type FireComBruto } from './shortsApi';

export const FIRES_KEY = ['shorts', 'fires'] as const;
export const ANDAMENTO_DAS_LIVES_KEY = ['shorts', 'lives', 'andamento'] as const;

// D-458: a lista é deliberadamente assíncrona ao pipeline — os candidatos nascem
// na geração do bruto e a curadoria acontece quando o operador quiser. Por isso
// não há refetch agressivo aqui: nada muda enquanto a tela está aberta, a menos
// que outra aba gere um bruto — ou que a fábrica de uma live esteja rodando.
export function useFires(habilitado = true) {
  return useQuery({
    queryKey: FIRES_KEY,
    queryFn: () => shortsApi.listarFires(),
    staleTime: 30_000,
    enabled: habilitado,
  });
}

/** D-1051: as migalhas das duas telas do Fire: a live e, nela, a linha do corte de origem. */
export function rotulosDoFire(fire: FireComBruto | undefined) {
  if (!fire) return [];
  return [
    { texto: fire.projeto_titulo, to: `/projetos/${fire.projeto_id}` },
    { texto: `Corte #${fire.numero}`, to: linhaDoCortePath(fire.projeto_id, fire.corte_id) },
  ];
}

export const estaRodando = (live: AndamentoDaLive) =>
  live.etapa === 'baixando' || live.etapa === 'gerando';

/**
 * D-803: o que a fábrica de cada live está fazendo.
 *
 * Só consulta de novo enquanto alguma live roda. E cada passo dela — a live que
 * chegou, um corte a mais pronto, o fim — muda a fila, então a lista de Fires é
 * recarregada nesses momentos, e não num relógio.
 */
export function useAndamentoDasLives() {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: ANDAMENTO_DAS_LIVES_KEY,
    queryFn: () => shortsApi.andamentoDasLives(),
    refetchInterval: (query) => (query.state.data?.lives.some(estaRodando) ? 3_000 : false),
  });

  const passos = consulta.data?.lives.map((l) => `${l.projeto_id}:${l.etapa}:${l.feitos}`).join('|');
  useEffect(() => {
    if (passos) void queryClient.invalidateQueries({ queryKey: FIRES_KEY });
  }, [passos, queryClient]);

  return consulta;
}
