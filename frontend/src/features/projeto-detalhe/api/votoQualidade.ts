import { api, dados, type Schema } from '@/shared/api';
// D-372: cliente HTTP do voto de qualidade POR LIVE, ao lado da pontuação que o
// ranking tinha dado — a referência para calibrar os pesos. Irmão por corte: a
// avaliação do corte (D-419). D-722: pelo cliente gerado do contrato.

export type VotoQualidadeResponse = Schema<'VotoQualidadeResponse'>;

const doProjeto = (projetoId: string) => ({ params: { path: { projeto_id: projetoId } } });

export const votoQualidadeApi = {
  obter: (projetoId: string) =>
    dados(api.GET('/api/ranking-lives/projetos/{projeto_id}/voto-qualidade', doProjeto(projetoId))),

  salvar: (projetoId: string, voto: number) =>
    dados(
      api.PUT('/api/ranking-lives/projetos/{projeto_id}/voto-qualidade', {
        ...doProjeto(projetoId),
        body: { voto },
      }),
    ),
};
