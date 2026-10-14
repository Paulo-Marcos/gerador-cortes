import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { novidadesKey, novidadesResumoKey } from '@/shared/chavesDeCache';
import { novidadesApi, type VersaoDasNovidades } from './api';
import { avisoDasNovidades } from './rotulos';

/** Um minuto: o ponto do trilho acende logo depois de um pull, sem martelar o backend. */
const INTERVALO_DO_RESUMO_MS = 60_000;

/** Quantas novidades o operador ainda não viu — o ponto do trilho. */
export function useNovidadesNaoVistas(): number {
  const { data } = useQuery({
    queryKey: novidadesResumoKey,
    queryFn: novidadesApi.resumo,
    refetchInterval: INTERVALO_DO_RESUMO_MS,
    retry: false,
  });
  return data?.novas ?? 0;
}

/** O ponto do item Novidades no trilho, com o motivo para o `title`. */
export function useAvisosDasNovidades(): { novidades?: string } {
  const novas = useNovidadesNaoVistas();
  return useMemo(() => (novas > 0 ? { novidades: avisoDasNovidades(novas) } : {}), [novas]);
}

/**
 * A lista, e a visita: ao abrir a tela, tudo passa a "visto" no backend.
 *
 * O selo "novo" não pode depender da lista que volta DEPOIS disso — ela já
 * viria toda vista. Por isso o que era novo é guardado na primeira leitura,
 * e é essa fotografia que a tela marca até ser fechada.
 */
export function useNovidades() {
  const queryClient = useQueryClient();
  const lista = useQuery({ queryKey: novidadesKey, queryFn: novidadesApi.listar });
  const [novasDaVisita, setNovasDaVisita] = useState<Set<string> | null>(null);

  const dados = lista.data;
  useEffect(() => {
    if (!dados || novasDaVisita) return;
    setNovasDaVisita(
      new Set(dados.flatMap((v) => v.novidades.filter((n) => n.nova).map((n) => n.chave))),
    );
    void novidadesApi
      .marcarVistas()
      .then(() => queryClient.invalidateQueries({ queryKey: novidadesResumoKey }));
  }, [dados, novasDaVisita, queryClient]);

  return { lista, novasDaVisita: novasDaVisita ?? new Set<string>() };
}

/** A versão da vez: aberta, fora da lista de paradas e com algo em inglês. */
export function versaoParaTraduzir(
  versoes: VersaoDasNovidades[],
  abertas: Set<string>,
  paradas: Set<string>,
): VersaoDasNovidades | undefined {
  return versoes.find(
    (v) =>
      abertas.has(v.versao) &&
      !paradas.has(v.versao) &&
      v.novidades.some((n) => n.traducao === null),
  );
}

/**
 * Traduz sozinha, lote a lote, as versões abertas que ainda estão em inglês.
 *
 * Uma por vez: a IA da assinatura tem fila, e duas versões em paralelo só
 * disputariam o mesmo lugar nela. A versão que falha (ou que volta sem
 * traduzir nada) sai da vez até o operador pedir de novo, senão o efeito
 * pediria para sempre.
 */
export function useTraducaoAutomatica(versoes: VersaoDasNovidades[], abertas: Set<string>) {
  const queryClient = useQueryClient();
  const [paradas, setParadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const emCurso = useRef(false);

  const traduzir = useMutation({
    mutationFn: novidadesApi.traduzir,
    onSuccess: (feita, versao) => {
      if (feita.traduzidas === 0) setParadas((atual) => new Set(atual).add(versao));
      void queryClient.invalidateQueries({ queryKey: novidadesKey });
    },
    onError: (falha, versao) => {
      setParadas((atual) => new Set(atual).add(versao));
      setErro(falha instanceof Error ? falha.message : 'A IA não respondeu.');
    },
    onSettled: () => {
      emCurso.current = false;
    },
  });

  const proxima = versaoParaTraduzir(versoes, abertas, paradas);
  const { mutate } = traduzir;
  useEffect(() => {
    if (!proxima || emCurso.current) return;
    emCurso.current = true;
    mutate(proxima.versao);
  }, [proxima, mutate]);

  const tentarDeNovo = () => {
    setParadas(new Set());
    setErro(null);
  };

  return { traduzindo: traduzir.isPending ? traduzir.variables : null, erro, tentarDeNovo };
}
