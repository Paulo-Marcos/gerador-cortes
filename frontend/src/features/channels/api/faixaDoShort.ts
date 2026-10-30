import { api, dados, type Schema } from '@/shared/api';
// D-997: cliente HTTP da faixa de duração dos shorts do canal ativo.

export type FaixaDoShort = Schema<'FaixaDoShort'>;
export type FaixaDoShortPayload = Schema<'FaixaDoShortRequest'>;

export const faixaDoShortApi = {
  ler: () => dados(api.GET('/api/channels/ativo/faixa-do-short')),

  salvar: (faixa: FaixaDoShortPayload) =>
    dados(api.PUT('/api/channels/ativo/faixa-do-short', { body: faixa })),
};
