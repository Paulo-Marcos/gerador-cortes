import { api, dados, type Schema } from '@/shared/api';

// D-922: o que entrou em cada versão, lido do CHANGELOG e traduzido pela IA.

export type VersaoDasNovidades = Schema<'VersaoResponse'>;
export type Novidade = Schema<'NovidadeResponse'>;

export const novidadesApi = {
  listar: () => dados(api.GET('/api/novidades')),

  resumo: () => dados(api.GET('/api/novidades/resumo')),

  marcarVistas: () => dados(api.POST('/api/novidades/vistas')),

  traduzir: (versao: string) => dados(api.POST('/api/novidades/traduzir', { body: { versao } })),
};
