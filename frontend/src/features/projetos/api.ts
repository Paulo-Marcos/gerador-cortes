import { api, dados, type Schema } from '@/shared/api';

// O ciclo do projeto (a live): listar, criar, abrir, excluir, rebaixar o vídeo,
// reiniciar downloads que falharam, limpar arquivos e a configuração de render.
// D-722: saiu de lib/api.ts para a feature, sobre o cliente gerado. O
// `reiniciarDownload` avulso não veio junto: não tinha quem o chamasse.

export type CriarProjetoRequest = Schema<'CriarProjetoRequest'>;
// O gerador trata campo com default como obrigatório; aqui só vai o que muda.
export type AtualizarRenderConfigRequest = Partial<Schema<'AtualizarRenderConfigRequest'>>;
export type LimparArquivosResponse = Schema<'LimpezaDeArquivosResponse'>;
export type ReiniciarFalhadosResponse = Schema<'DownloadsFalhadosResponse'>;

const doProjeto = (id: string) => ({ params: { path: { projeto_id: id } } });

export const projetosApi = {
  listarProjetos: () => dados(api.GET('/api/projetos')),

  criarProjeto: (body: CriarProjetoRequest) => dados(api.POST('/api/projetos', { body })),

  obterProjeto: (id: string) => dados(api.GET('/api/projetos/{projeto_id}', doProjeto(id))),

  removerProjeto: (id: string) => dados(api.DELETE('/api/projetos/{projeto_id}', doProjeto(id))),

  // D-527: traz de volta o vídeo de uma live já limpa, preservando o resto.
  // NÃO confundir com a rota `reiniciar-download`, que zera transcrição, título
  // e duração — os cortes apontam para tempos daquela transcrição.
  rebaixarVideoProjeto: (id: string) =>
    dados(api.POST('/api/projetos/{projeto_id}/rebaixar-video', doProjeto(id))),

  // Sem corpo: o default do backend preserva o bruto dos Fires com shorts pendentes.
  limparArquivosProjeto: (id: string) =>
    dados(api.POST('/api/projetos/{projeto_id}/limpar-arquivos', doProjeto(id))),

  reiniciarDownloadsFalhados: () => dados(api.POST('/api/projetos/reiniciar-downloads-falhados')),

  atualizarRenderConfig: (id: string, body: AtualizarRenderConfigRequest) =>
    dados(
      api.PATCH('/api/projetos/{projeto_id}/render-config', {
        ...doProjeto(id),
        // o mesmo default do backend: sem `global_update`, muda só este projeto
        body: { global_update: false, ...body },
      }),
    ),
};
