import { api, dados, type Schema } from '@/shared/api';

// A análise da live pelo lado do projeto: a trilha da última análise, o prompt
// do modo manual (inteiro ou de um intervalo), a importação da resposta colada,
// a reanálise, o intervalo e a transcrição refeita. A análise que chama a IA
// está em features/ia. D-722: saiu de lib/api.ts, sobre o cliente gerado.

export type AuditoriaAnalise = Schema<'AuditoriaAnaliseResponse'>;
export type AuditoriaCorteItem = Schema<'AuditoriaCorteItem'>;
export type ImportarAnaliseRequest = Schema<'ImportarAnaliseRequest'>;
export type AnalisarIntervaloRequest = Schema<'AnalisarIntervaloRequest'>;

const doProjeto = (id: string) => ({ params: { path: { projeto_id: id } } });

export const analiseApi = {
  /** I-034: a justificativa de cada corte e o que a IA decidiu não cortar. */
  obterAuditoriaAnalise: (projetoId: string) =>
    dados(api.GET('/api/projetos/{projeto_id}/auditoria-analise', doProjeto(projetoId))),

  obterPromptAnalise: (projetoId: string) =>
    dados(api.GET('/api/projetos/{projeto_id}/analise/prompt', doProjeto(projetoId))),

  obterPromptAnaliseIntervalo: (
    projetoId: string,
    intervalo: AnalisarIntervaloRequest & { blocos: number },
  ) =>
    dados(
      api.GET('/api/projetos/{projeto_id}/analise-intervalo/prompt', {
        params: { path: { projeto_id: projetoId }, query: intervalo },
      }),
    ),

  importarAnalise: (projetoId: string, body: ImportarAnaliseRequest) =>
    dados(api.POST('/api/projetos/{projeto_id}/analise/importar', { ...doProjeto(projetoId), body })),

  reanalisarProjeto: (projetoId: string) =>
    dados(api.POST('/api/projetos/{projeto_id}/reanalisar', doProjeto(projetoId))),

  // Re-baixa a transcrição via json3 (sem roll-up/duplicação do VTT) e
  // re-sincroniza todos os cortes (transcricao_final).
  refazerTranscricao: (projetoId: string) =>
    dados(api.POST('/api/projetos/{projeto_id}/refazer-transcricao', doProjeto(projetoId))),

  analisarIntervalo: (projetoId: string, body: AnalisarIntervaloRequest) =>
    dados(api.POST('/api/projetos/{projeto_id}/analisar-intervalo', { ...doProjeto(projetoId), body })),
};
