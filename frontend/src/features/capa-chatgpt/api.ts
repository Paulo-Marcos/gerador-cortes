import { api, dados, ErroDaApi, type Schema } from '@/shared/api';
import { ORIGEM_API } from '@/lib/apiBase';
import { mensagemErro } from '@/lib/mensagemErro';

// D-804: a capa gerada no ChatGPT do operador, pelo navegador dele.

export type ConfiguracaoCapaChatgpt = Schema<'ConfiguracaoCapaChatgptResponse'>;
/** D-898: a capa que recebe a imagem — o corte (youtube, tiktok) ou o short. */
export type DestinoDaCapa = Schema<'PedirCapaChatgptRequest'>['destino'];
export type PedidoCapaChatgpt = Schema<'PedidoCapaChatgpt'>;

/** O quadro de cada capa — o backend decide; aqui só para dizer ao operador. */
export const PROPORCAO_DO_DESTINO: Record<DestinoDaCapa, string> = {
  youtube: '16:9',
  tiktok: '4:5',
  short: '9:16',
};
/** D-840: uma pessoa real da capa e a foto dela no banco de retratos (`slug`). */
export type PessoaDaCapa = Schema<'PessoaDaCapa'>;

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

  /**
   * D-898: põe a capa na fila do robô e devolve a ficha na hora. Quem salva a
   * imagem é o backend; `pessoas` é o elenco conferido na tela (sem ele, o
   * backend o lê do prompt).
   */
  pedir: (destino: DestinoDaCapa, alvoId: string, prompt: string, pessoas?: string[]) =>
    dados(
      api.POST('/api/capa-chatgpt/pedidos', {
        body: { destino, alvo_id: alvoId, prompt, pessoas },
      }),
    ),

  /** O último pedido desta capa: em que passo está, ou por que parou. */
  pedido: async (destino: DestinoDaCapa, alvoId: string) =>
    (
      await dados(
        api.GET('/api/capa-chatgpt/pedidos/{destino}/{alvo_id}', {
          params: { path: { destino, alvo_id: alvoId } },
        }),
      )
    ).pedido,
};

/** As pessoas reais que o prompt desenha, cada uma com a foto que irá junto. */
export const elencoDaCapa = async (prompt: string) =>
  (await dados(api.POST('/api/capa-chatgpt/elenco', { body: { prompt } }))).pessoas;

/**
 * A foto de alguém que o operador acrescentou: o banco de retratos, e a
 * Wikipédia na falta dele. 404 não é erro — é a pessoa sem foto.
 */
export async function fotoDaPessoa(nome: string): Promise<PessoaDaCapa> {
  try {
    const achado = await dados(api.POST('/api/retratos/buscar', { params: { query: { nome } } }));
    return { nome, slug: achado.slug };
  } catch (erro) {
    if (erro instanceof ErroDaApi && erro.status === 404) return { nome, slug: null };
    throw erro;
  }
}

/** Sobe a foto de alguém para o banco de retratos: a próxima capa já a encontra. */
export async function subirFotoDaPessoa(nome: string, arquivo: File): Promise<PessoaDaCapa> {
  const salvo = await dados(
    api.POST('/api/retratos/upload', {
      body: { nome, arquivo: arquivo as unknown as string },
      bodySerializer: (corpo: { nome: string; arquivo: string }) => {
        const form = new FormData();
        form.append('nome', corpo.nome);
        form.append('arquivo', corpo.arquivo);
        return form;
      },
    }),
  );
  return { nome, slug: salvo.slug };
}

/** A foto no banco de retratos. `versao` fura o cache quando ela é trocada. */
export const retratoUrl = (slug: string, versao: number) =>
  `${ORIGEM_API}/api/retratos/${encodeURIComponent(slug)}?v=${versao}`;

/** A miniatura de uma ficha. `versao` fura o cache quando a ficha é trocada. */
export const fichaUrl = (nome: string, versao: number) =>
  `${ORIGEM_API}/api/capa-chatgpt/fichas/${encodeURIComponent(nome)}?v=${versao}`;

/** O `detail` do backend já é a frase para o operador; o status HTTP é ruído. */
export const mensagemDoRobo = (erro: unknown, alternativa: string) =>
  erro instanceof ErroDaApi ? erro.detalhe : mensagemErro(erro, alternativa);
