import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shortsApi, type AtualizarShortBody } from './shortsApi';
import { FIRES_KEY } from './useFires';

export const shortsDoCorteKey = (corteId: string) => ['shorts', 'corte', corteId] as const;

export function useShortsDoCorte(corteId: string) {
  return useQuery({
    queryKey: shortsDoCorteKey(corteId),
    queryFn: () => shortsApi.listarDoCorte(corteId),
    enabled: Boolean(corteId),
  });
}

interface AtualizarArgs extends AtualizarShortBody {
  shortId: string;
}

export function useAtualizarShort(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shortId, ...body }: AtualizarArgs) => shortsApi.atualizar(shortId, body),
    // A lista de Fires mostra a contagem por status, entao aprovar/rejeitar aqui
    // muda o card la tambem — invalidar as duas evita a tela mentir.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
    },
  });
}

// D-460: descartar o bruto encerra a fabrica de shorts daquele corte, entao o
// Fire some da lista — invalidar FIRES_KEY e o que faz a tela contar a verdade.
export function useDescartarBruto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corteId: string) => shortsApi.descartarBruto(corteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: FIRES_KEY }),
  });
}

// D-466: o render e sincrono e demora (ffmpeg + Remotion + composicao). A tela
// segura o botao pelo isPending em vez de fingir que terminou.
export function useRenderizarShort(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.renderizar(shortId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
    },
  });
}

// D-485: o disparo volta na hora; quem acompanha e o `useProgressoRender`.
export function useRenderizarPrevia(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.renderizarPrevia(shortId),
    onSuccess: () => qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) }),
  });
}

/**
 * D-485: acompanha o render de UM short enquanto ele corre.
 *
 * O polling so existe enquanto ha algo rodando — sem isso a tela bateria no
 * backend de dois em dois segundos para sempre, por candidato, mesmo com todos
 * parados. `refetchInterval` devolvendo `false` desliga sozinho.
 *
 * Quando termina, invalida a lista: e la que o caminho do arquivo aparece.
 */
export function useProgressoRender(shortId: string, corteId: string, ativo: boolean) {
  const qc = useQueryClient();
  const jaInvalidou = useRef(false);

  const query = useQuery({
    queryKey: ['shorts', 'progresso', shortId],
    queryFn: () => shortsApi.progresso(shortId),
    enabled: ativo,
    refetchInterval: (q) => (q.state.data?.render?.concluido === false ? 2000 : false),
  });

  const concluido = query.data?.render?.concluido;
  useEffect(() => {
    if (concluido && !jaInvalidou.current) {
      jaInvalidou.current = true;
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
    }
    if (concluido === false) jaInvalidou.current = false;
  }, [concluido, corteId, qc]);

  return query.data?.render ?? null;
}

export function usePreviaPublicacao(shortId: string | null) {
  return useQuery({
    queryKey: ['shorts', 'publicacao', shortId],
    queryFn: () => shortsApi.previaPublicacao(shortId as string),
    enabled: Boolean(shortId),
  });
}

// D-468/469/470: um mutate so para os dois modos. Quem decide se e upload por
// API ou pasta pronta e o destino, no backend — a tela nao precisa saber.
export function usePublicarShort() {
  return useMutation({
    mutationFn: ({ shortId, plataforma }: { shortId: string; plataforma: string }) =>
      shortsApi.publicar(shortId, plataforma),
  });
}

// D-479: as palavras do bruto mudam so quando a transcricao muda — nunca por
// causa de uma aprovacao ou de um arraste de borda. Fica fora do
// `shortsDoCorteKey` de proposito: senao cada PATCH refaria um download de
// milhares de palavras para redesenhar a mesma legenda.
export function useTranscricaoDoCorte(corteId: string) {
  return useQuery({
    queryKey: ['shorts', 'transcricao', corteId],
    queryFn: () => shortsApi.transcricaoDoCorte(corteId),
    enabled: Boolean(corteId),
    staleTime: Infinity,
  });
}

// E-036/D-487: o catalogo e do sistema, nao do corte — cabe cache eterno.
export function useModelosDePalco() {
  return useQuery({
    queryKey: ['shorts', 'palco', 'modelos'],
    queryFn: () => shortsApi.modelosDePalco(),
    staleTime: Infinity,
  });
}

export function usePalcoDoCorte(corteId: string) {
  return useQuery({
    queryKey: ['shorts', 'palco', corteId],
    queryFn: () => shortsApi.palcoDoCorte(corteId),
    enabled: Boolean(corteId),
  });
}

// Trocar o preset muda as regioes, e as regioes mudam o modelo sugerido de TODO
// candidato do corte — dai invalidar a lista tambem.
export function useEscolherPreset(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) => shortsApi.escolherPreset(corteId, presetId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shorts', 'palco', corteId] });
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
    },
  });
}
