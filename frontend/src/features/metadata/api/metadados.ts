import { api, dados, type Schema } from '@/shared/api';

// O metadado do corte e a capa: ler, editar, alternar o Fire, o modo manual
// (prompt para uma IA de fora e a importação da resposta) e as operações da
// capa. D-722: saiu de lib/api.ts, sobre o cliente gerado. As gerações que
// chamam a IA pela assinatura estão em features/ia.

export type MetadadoPatch = Schema<'AtualizarMetadadoRequest'>;
export type PromptManual = Schema<'PromptManualResponse'>;

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const metadadosApi = {
  obterMetadado: (corteId: string) =>
    dados(api.GET('/api/metadados/corte/{corte_id}', doCorte(corteId))),

  atualizarMetadado: (corteId: string, patch: MetadadoPatch) =>
    dados(api.PATCH('/api/metadados/corte/{corte_id}', { ...doCorte(corteId), body: patch })),

  toggleFireMeta: (corteId: string) =>
    dados(api.POST('/api/metadados/corte/{corte_id}/toggle-fire', doCorte(corteId))),

  gerarThumbnail: (corteId: string) =>
    dados(api.POST('/api/metadados/corte/{corte_id}/gerar-thumbnail', doCorte(corteId))),

  uploadThumbnail: (corteId: string, file: File) =>
    dados(
      api.POST('/api/metadados/corte/{corte_id}/thumbnail-manual', {
        ...doCorte(corteId),
        // O contrato descreve o arquivo como texto binário; quem o leva é o
        // FormData, e com ele o próprio navegador monta o Content-Type.
        body: { file: file as unknown as string },
        bodySerializer: (corpo) => {
          const form = new FormData();
          form.append('file', corpo.file);
          return form;
        },
      }),
    ),

  aplicarMolduraThumbnail: (corteId: string) =>
    dados(api.POST('/api/metadados/corte/{corte_id}/aplicar-moldura', doCorte(corteId))),

  comprimirThumbnail: (corteId: string) =>
    dados(api.POST('/api/metadados/corte/{corte_id}/comprimir-thumbnail', doCorte(corteId))),

  removerThumbnail: (corteId: string) =>
    dados(api.DELETE('/api/metadados/corte/{corte_id}/thumbnail', doCorte(corteId))),

  obterPromptMeta: (corteId: string) =>
    dados(api.GET('/api/metadados/corte/{corte_id}/meta/prompt', doCorte(corteId))),

  obterPromptThumbnail: (corteId: string) =>
    dados(api.GET('/api/metadados/corte/{corte_id}/prompt-thumbnail/prompt', doCorte(corteId))),

  obterPromptThumbnailAgente: (corteId: string) =>
    dados(api.GET('/api/metadados/corte/{corte_id}/thumbnail-agent/prompt', doCorte(corteId))),

  obterPromptThumbnailAgenteLivre: (corteId: string) =>
    dados(
      api.GET('/api/metadados/corte/{corte_id}/thumbnail-agent-livre/prompt', doCorte(corteId)),
    ),

  // O corpo é a resposta que o operador colou de uma IA de fora: quem confere
  // a forma é o backend, que recusa com 422 o que não servir.
  importarMeta: (corteId: string, payload: unknown) =>
    dados(
      api.POST('/api/metadados/corte/{corte_id}/meta/importar', {
        ...doCorte(corteId),
        body: payload as Schema<'ImportarMetaRequest'>,
      }),
    ),

  importarPromptThumbnail: (corteId: string, payload: unknown) =>
    dados(
      api.POST('/api/metadados/corte/{corte_id}/prompt-thumbnail/importar', {
        ...doCorte(corteId),
        body: payload as Schema<'ImportarPromptThumbnailRequest'>,
      }),
    ),
};
