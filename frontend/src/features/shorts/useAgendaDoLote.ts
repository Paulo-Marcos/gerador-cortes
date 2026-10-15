// D-908: a agenda distribuída, do lado dos dados.
//
// A previsão é uma consulta (react-query) chaveada pela seleção: mudar os
// trechos ou as redes recalcula tudo, porque a agenda é dessa seleção. Já o
// AJUSTE de uma linha é estado local por cima da previsão — e por isso não
// dispara consulta nenhuma: o operador mexe numa hora e as outras ficam paradas.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ajustarLinha } from './agendaDoLote';
import { loteApi, type LinhaDaAgenda } from './loteApi';
import { motivoDoErro } from './shortsApi';

export function agendaKey(alvos: string[], plataformas: string[]) {
  return ['shorts', 'lote', 'agenda', alvos, plataformas] as const;
}

export function useAgendaDoLote(alvos: string[], plataformas: string[], ligado: boolean) {
  const query = useQuery({
    queryKey: agendaKey(alvos, plataformas),
    queryFn: () => loteApi.preverAgenda(alvos, plataformas),
    enabled: ligado && alvos.length > 0 && plataformas.length > 0,
    // A agenda parte do último já marcado: um lote disparado entre duas
    // aberturas do modal muda a resposta, então nada de servir do cache.
    staleTime: 0,
  });

  // A primeira pintura já mostra a agenda que estiver em cache (D-934).
  const [linhas, setLinhas] = useState<LinhaDaAgenda[]>(() => query.data?.itens ?? []);
  useEffect(() => {
    setLinhas(query.data?.itens ?? []);
  }, [query.data]);

  return {
    linhas: ligado && alvos.length > 0 ? linhas : [],
    carregando: query.isFetching,
    erro: query.isError ? motivoDoErro(query.error, 'não consegui calcular a agenda') : null,
    ajustar: (chave: string, agendarPara: string) =>
      setLinhas((atual) => ajustarLinha(atual, chave, agendarPara)),
    recalcular: () => void query.refetch(),
  };
}
