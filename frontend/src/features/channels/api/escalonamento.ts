import { api, dados, type Schema } from '@/shared/api';
// D-908: cliente HTTP da referência do público e dos blocos de publicação por canal.
// Endpoints sob /editorial-skills/escalonamento, ao lado dos pesos do ranking.

export type Escalonamento = Schema<'EscalonamentoResponse'>;
export type FaixaDoPublico = Schema<'FaixaDoPublicoModel'>;
export type ParametrosDoDestino = Schema<'ParametrosDoDestinoModel'>;
export type DestinoEscalonado = Escalonamento['destinos'][number];

const doDestino = (destino: string) => ({ params: { path: { destino } } });

export const escalonamentoApi = {
  ver: () => dados(api.GET('/api/editorial-skills/escalonamento')),

  salvarPublico: (faixas: FaixaDoPublico[]) =>
    dados(api.PUT('/api/editorial-skills/escalonamento/publico', { body: { faixas } })),

  salvarDestino: (destino: string, parametros: ParametrosDoDestino) =>
    dados(
      api.PUT('/api/editorial-skills/escalonamento/destinos/{destino}', {
        ...doDestino(destino),
        body: parametros,
      }),
    ),

  /** Os mesmos N blocos do destino, realinhados à janela forte do público. */
  sugerirBlocos: (destino: string) =>
    dados(
      api.GET('/api/editorial-skills/escalonamento/destinos/{destino}/sugestao', doDestino(destino)),
    ),

  /** `chave` é "publico" ou um destino; o reset apaga a linha do canal. */
  resetar: (chave: string) =>
    dados(
      api.POST('/api/editorial-skills/escalonamento/reset/{chave}', {
        params: { path: { chave } },
      }),
    ),
};
