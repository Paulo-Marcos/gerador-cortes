import { api, dados, type Schema } from '@/shared/api';
// D-1006: cliente HTTP dos motivos de excluir um corte, do canal ativo.

export type MotivosDeExclusao = Schema<'MotivosDeExclusao'>;
export type MotivoDeExclusao = Schema<'MotivoDeExclusao'>;

export const motivosDeExclusaoApi = {
  ler: () => dados(api.GET('/api/channels/ativo/motivos-de-exclusao')),

  acrescentar: (rotulo: string) =>
    dados(api.POST('/api/channels/ativo/motivos-de-exclusao', { body: { rotulo } })),

  mostrar: (slug: string, ativo: boolean) =>
    dados(
      api.PUT('/api/channels/ativo/motivos-de-exclusao/{slug}', {
        params: { path: { slug } },
        body: { ativo },
      }),
    ),
};
