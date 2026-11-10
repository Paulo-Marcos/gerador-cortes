// D-1006: os motivos de tirar um corte são do canal ativo, editáveis na tela
// de Canais. O aviso do corte riscado (D-1088, D-1096) mostra só os visíveis; a
// telemetria nomeia todos, inclusive os escondidos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpcaoConfirmacao } from '@/components/ui/confirm-dialog';
import { motivosDeExclusaoApi, type MotivosDeExclusao } from '@/features/channels/api/motivosDeExclusao';

export const CHAVE_MOTIVOS_DE_EXCLUSAO = ['motivos-de-exclusao'] as const;

export function useMotivosDeExclusao() {
  return useQuery({ queryKey: CHAVE_MOTIVOS_DE_EXCLUSAO, queryFn: motivosDeExclusaoApi.ler });
}

/** Os chips que o aviso do riscado oferece: só os que o canal não escondeu. */
export function motivosVisiveis(lista: MotivosDeExclusao): OpcaoConfirmacao[] {
  return lista.motivos.filter((m) => m.ativo).map(({ slug, rotulo }) => ({ slug, rotulo }));
}

/**
 * Os chips do aviso do corte riscado. `undefined` enquanto a lista não chega:
 * o aviso usa o padrão, e o backend descarta o que o canal escondeu.
 */
export function useMotivosVisiveis(): readonly OpcaoConfirmacao[] | undefined {
  const { data } = useMotivosDeExclusao();
  return data ? motivosVisiveis(data) : undefined;
}

export function useEditarMotivosDeExclusao() {
  const queryClient = useQueryClient();
  const gravar = (lista: MotivosDeExclusao) => queryClient.setQueryData(CHAVE_MOTIVOS_DE_EXCLUSAO, lista);
  return {
    acrescentar: useMutation({ mutationFn: motivosDeExclusaoApi.acrescentar, onSuccess: gravar }),
    mostrar: useMutation({
      mutationFn: ({ slug, ativo }: { slug: string; ativo: boolean }) => motivosDeExclusaoApi.mostrar(slug, ativo),
      onSuccess: gravar,
    }),
  };
}
