import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EstiloDaCapaTiktok } from '@/types/presets';
import { estiloDaCapaApi, type Alvo, type EstiloDaCapaDoCanal } from './estiloDaCapaApi';

// D-933: os hooks do modal "Estilizar capa".

const CHAVE = 'capa-tiktok-estilo';

export function useEstiloDaCapa(alvo: Alvo) {
  return useQuery({
    queryKey: [CHAVE, alvo.corteId],
    queryFn: () => estiloDaCapaApi.obter(alvo),
  });
}

/** A prévia do rascunho; mantém a anterior na tela enquanto a nova chega. */
export function usePreviaDaCapa(alvo: Alvo, rascunho: EstiloDaCapaTiktok | null) {
  return useQuery({
    queryKey: [CHAVE, 'previa', alvo.corteId, rascunho],
    queryFn: () => estiloDaCapaApi.prever(alvo, rascunho ?? {}),
    enabled: rascunho !== null,
    placeholderData: keepPreviousData,
  });
}

export function useGravarEstiloDaCapa(alvo: Alvo) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (estilo: EstiloDaCapaTiktok) => estiloDaCapaApi.gravar(alvo, estilo),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

/** D-938: o desenho da capa do canal, para a tela de Canais. */
export function useEstiloDaCapaDoCanal() {
  return useQuery({
    queryKey: [CHAVE, 'do-canal'],
    queryFn: estiloDaCapaApi.obterDoCanal,
  });
}

export function useEscolherEstiloDaCapaDoCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (estilo: EstiloDaCapaDoCanal) => estiloDaCapaApi.escolherDoCanal(estilo),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
