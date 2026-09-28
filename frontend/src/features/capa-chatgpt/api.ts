import { api, dados, ErroDaApi, type Schema } from '@/shared/api';
import { ORIGEM_API } from '@/lib/apiBase';
import { mensagemErro } from '@/lib/mensagemErro';

// D-804: a capa gerada no ChatGPT do operador, pelo navegador dele.

export type ConfiguracaoCapaChatgpt = Schema<'ConfiguracaoCapaChatgptResponse'>;
export type ProporcaoDaCapa = Schema<'GerarCapaChatgptRequest'>['proporcao'];

const comoArquivo = (arquivo: File) => ({
  body: { arquivo: arquivo as unknown as string },
  bodySerializer: (corpo: { arquivo: string }) => {
    const form = new FormData();
    form.append('arquivo', corpo.arquivo);
    return form;
  },
});

export const capaChatgptApi = {
  configuracao: () => dados(api.GET('/api/capa-chatgpt/config')),

  gravarProjeto: (projetoUrl: string) =>
    dados(api.PUT('/api/capa-chatgpt/config', { body: { projeto_url: projetoUrl } })),

  subirFicha: (arquivo: File) => dados(api.POST('/api/capa-chatgpt/fichas', comoArquivo(arquivo))),

  removerFicha: (nome: string) =>
    dados(api.DELETE('/api/capa-chatgpt/fichas/{nome}', { params: { path: { nome } } })),

  /** A imagem gerada, já como `File` — pronta para o upload que o Ctrl+V usa. */
  gerar: async (prompt: string, proporcao: ProporcaoDaCapa): Promise<File> => {
    const blob = await dados(
      api.POST('/api/capa-chatgpt/gerar', { body: { prompt, proporcao }, parseAs: 'blob' }),
    );
    const extensao = blob.type.split('/')[1] || 'png';
    return new File([blob], `chatgpt.${extensao}`, { type: blob.type || 'image/png' });
  },
};

/** A miniatura de uma ficha. `versao` fura o cache quando a ficha é trocada. */
export const fichaUrl = (nome: string, versao: number) =>
  `${ORIGEM_API}/api/capa-chatgpt/fichas/${encodeURIComponent(nome)}?v=${versao}`;

/** O `detail` do backend já é a frase para o operador; o status HTTP é ruído. */
export const mensagemDoRobo = (erro: unknown, alternativa: string) =>
  erro instanceof ErroDaApi ? erro.detalhe : mensagemErro(erro, alternativa);
