// D-458: cliente HTTP da fábrica de shorts. D-722: sobre o cliente gerado do
// contrato — os tipos daqui são os do `openapi.json`, com duas exceções que a
// tela lê pelos tipos dela: as cenas do short (o contrato da cena é da D-725)
// e a aparência do preset de gancho. A conversão das duas mora aqui, num lugar
// só, em `paraOShortDaTela` e no `ganchoPadrao`.

import type { GanchoShortPreset } from '@/types/presets';
import type { Segmento } from './segmentosDoShort';
import type { ProviderIA } from '@/lib/providerIa';
import { API_BASE } from '@/lib/apiBase';
import { api, dados, type Schema } from '@/shared/api';

/**
 * A frase que o backend escreveu em `detail`, sem o envelope do `request`.
 *
 * O `request` lança `"<status> <texto> — <corpo>"`: bom para log, ruim para a
 * tela, onde o motivo de um 422 ficava afogado em JSON.
 */
export function motivoDoErro(erro: unknown, padrao: string): string {
  if (!(erro instanceof Error) || !erro.message) return padrao;

  const inicioDoCorpo = erro.message.indexOf('{');
  if (inicioDoCorpo < 0) return erro.message;

  try {
    const { detail } = JSON.parse(erro.message.slice(inicioDoCorpo)) as { detail?: unknown };
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail)) {
      const mensagens = detail
        .map((item) => (item as { msg?: unknown })?.msg)
        .filter((msg): msg is string => typeof msg === 'string');
      if (mensagens.length) return mensagens.join('; ');
    }
  } catch {
    // Corpo que não é JSON: a mensagem crua ainda diz mais que o texto padrão.
  }
  return erro.message;
}

// ─── Contratos ─────────────────────────────────────────────────────────────

export type StatusShort = Schema<'ShortResponse'>['status'];

/** Os quatro tipos de cena vertical — espelha `cenas-shorts/schema.ts`. */
export type TipoCenaShort = 'hook' | 'numero' | 'citacao' | 'cta';

export interface CenaShort {
  tipo: TipoCenaShort;
  inicio: number;
  fim: number;
  texto: string;
  apoio?: string;
}

export type ContagemShorts = Schema<'ContagemDeShorts'>;
export type FireComBruto = Schema<'FireDaFabrica'>;
export type AndamentoDaLive = Schema<'AndamentoDaLive'>;
export type Retangulo = Schema<'RetanguloDoPalco'>;

/** O short como a tela o lê: o do contrato, com as cenas pelo tipo da tela. */
export type ShortSugerido = Omit<Schema<'ShortResponse'>, 'cenas'> & { cenas: CenaShort[] };

/** A decisão da curadoria: só o que veio é aplicado. */
export interface AtualizarShortBody {
  status?: StatusShort;
  inicio_seg?: number;
  fim_seg?: number;
  /** D-604: a colagem. `[]` desfaz e devolve o short à janela única. */
  segmentos?: Segmento[];
  foco_x?: number;
  arranjo_palco?: string;
  janela_cheia?: string;
  ajustes_palco?: Record<string, Retangulo>;
  palco_preset?: string;
  moldura?: string;
  recortes_palco?: Record<string, Retangulo>;
  fundo_palco?: string;
  fundo_editorial?: string;
  legenda_cor?: string;
  legenda_fonte?: string;
  /** D-605: o lugar da legenda neste trecho. 0 devolve ao palco do corte. */
  legenda_x?: number;
  legenda_y?: number;
  legenda_largura?: number;
  palco_short_preset?: string;
  /** D-565: o titulo-gancho da abertura. "" apaga. */
  gancho_tela?: string;
  gancho_ate_seg?: number;
  /** D-581: a aparencia do gancho. "" na cor volta ao branco. */
  gancho_cor?: string;
  gancho_realce?: string;
  /** D-600: o lugar do gancho neste trecho. 0 devolve ao padrão do corte. */
  gancho_x?: number;
  gancho_y?: number;
  gancho_largura?: number;
}
export type PostDoShortApi = Schema<'PostDoShortResponse'>;
export type AtualizarPostBody = Schema<'AtualizarPostRequest'>;
export type CapaDoShortApi = Schema<'CapaDoShortResponse'>;
export type GerarCapaBody = Schema<'GerarCapaRequest'>;

/** URL do bruto do corte — reusa o redirect com cache-buster de `/cortes`. */
export function brutoUrl(corteId: string): string {
  return `${API_BASE}/cortes/${corteId}/video-bruto`;
}

export type ArranjoPalco = Schema<'ArranjoDoPalco'>;
export type EstadoPalco = Schema<'EstadoDoPalcoResponse'>;
export type RecorteDesenhavel = Schema<'RecorteDesenhavel'>;
export type PlanoDesenhavel = Schema<'PlanoDesenhavelResponse'>;
export type VereditoDoRosto = Omit<Schema<'EnquadramentoResponse'>, 'short'> & {
  short: ShortSugerido;
};
export type FundoDoCanal = Schema<'FundoDoCanal'>;
export type PassoRender = Schema<'PassoDoBruto'>;
export type PalcoPadrao = Schema<'PalcoPadraoResponse'>;
export type GanchoPadrao = Omit<Schema<'GanchoPadraoResponse'>, 'payload'> & {
  payload: Partial<GanchoShortPreset>;
};
export type LogDoRender = Schema<'LogDoRenderResponse'>;
export type ProgressoRender = Schema<'ProgressoDoRenderDoShort'>;

/** URL do MP4 do short. `estagio` escolhe entre o rascunho e o que vai publicar. */
export function shortVideoUrl(shortId: string, estagio: 'previa' | 'final'): string {
  return `${API_BASE}/shorts/${shortId}/video?estagio=${estagio}`;
}

/**
 * D-565 (onda 4): a imagem da capa gravada.
 *
 * `v` e o INSTANTE, e nao um contador: trocar o quadro muda o instante, e e
 * exatamente quando o navegador precisa parar de servir a imagem antiga.
 */
export function capaImagemUrl(shortId: string, v: number): string {
  return `${API_BASE}/shorts/${shortId}/capa/imagem?v=${v}`;
}

export type PacotePublicacao = Schema<'PacoteDePublicacao'>;
/** Varia com o destino: API, pacote manual ou robô assistido. */
export type ResultadoPublicacao = Schema<'ResultadoDaPublicacao'>;
export type EstadoItemLote = Schema<'ItemDoLote'>['estado'];
export type ItemDoLote = Schema<'ItemDoLote'>;
export type RaiaDoLote = Schema<'RaiaDoLote'>;
export type LotePublicacao = Schema<'LoteDePublicacao'>;

/** O que a tela escolhe antes de disparar o lote. */
export interface OpcoesDoLote {
  tiktokAssistido: boolean;
  instagramAssistido: boolean;
  publicarSozinho: boolean;
  agendarPara: string;
  republicar: boolean;
}

/** D-834: o que o modal do TikTok decide para todos os envios dele, avulsos ou em lote. */
export type EnvioAssistido = Pick<OpcoesDoLote, 'agendarPara' | 'publicarSozinho'>;

export type ShortIdentificado = Pick<ShortSugerido, 'id' | 'titulo'>;
export type ShortPronto = Schema<'ShortProntoResponse'>;
export type PublicacaoRegistrada = Schema<'PublicacaoRegistrada'>;
export type PalavraTranscrita = Schema<'PalavraDoBruto'>;
export type TranscricaoDoBruto = Schema<'TranscricaoDoBrutoResponse'>;
export type ElegibilidadeShorts = Schema<'ElegibilidadeResponse'>;

// ─── Conversões e caminhos ─────────────────────────────────────────────────

type ShortDoContrato = Schema<'ShortResponse'>;
const paraOShortDaTela = (short: ShortDoContrato) => short as unknown as ShortSugerido;
// O patch da tela usa os tipos dela (retângulos, segmentos, status); o corpo do
// contrato aceita o mesmo, mais frouxo. A conversão é só de tipo.
const paraOCorpoDoShort = (body: AtualizarShortBody) => body as Schema<'AtualizarShortRequest'>;
const comShort = <T extends { short: ShortDoContrato }>(r: T): Omit<T, 'short'> & { short: ShortSugerido } => ({
  ...r,
  short: paraOShortDaTela(r.short),
});
const comShorts = <T extends { shorts: ShortDoContrato[] }>(
  r: T,
): Omit<T, 'shorts'> & { shorts: ShortSugerido[] } => ({
  ...r,
  shorts: r.shorts.map(paraOShortDaTela),
});

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });
const doShort = (shortId: string) => ({ params: { path: { short_id: shortId } } });
const doShortComProvider = (shortId: string, provider: ProviderIA) => ({
  params: { path: { short_id: shortId }, query: { provider } },
});

/** Um arquivo como multipart: com FormData, quem monta o Content-Type (com o
 *  `boundary`) é o navegador — a D-529 foi um 422 por declarar JSON por cima. */
const comoArquivo = (arquivo: File) => ({
  body: { arquivo: arquivo as unknown as string },
  bodySerializer: (corpo: { arquivo: string }) => {
    const form = new FormData();
    form.append('arquivo', corpo.arquivo);
    return form;
  },
});

export const shortsApi = {
  listarFires: () => dados(api.GET('/api/shorts/fires')),

  indicarParaShorts: (corteId: string, indicado: boolean) =>
    dados(api.POST('/api/shorts/corte/{corte_id}/indicar', { ...doCorte(corteId), body: { indicado } })),

  /** D-593: tira o corte da fila (shorts já nas redes) ou o devolve a ela. */
  marcarFinalizado: (corteId: string, finalizado: boolean) =>
    dados(api.PUT('/api/shorts/corte/{corte_id}/finalizado', { ...doCorte(corteId), body: { finalizado } })),

  elegibilidade: (corteId: string) =>
    dados(api.GET('/api/shorts/corte/{corte_id}/elegibilidade', doCorte(corteId))),

  gerarManualmente: async (corteId: string) =>
    comShorts(await dados(api.POST('/api/shorts/corte/{corte_id}/gerar', doCorte(corteId)))),

  /** D-803: um clique por live — baixa se foi limpa, refaz os brutos, propõe os shorts. */
  gerarDaLive: (projetoId: string) =>
    dados(api.POST('/api/shorts/live/{projeto_id}/gerar', { params: { path: { projeto_id: projetoId } } })),

  andamentoDasLives: () => dados(api.GET('/api/shorts/lives/andamento')),

  criarManual: async (corteId: string, body: { inicio_seg: number; fim_seg: number; titulo?: string }) =>
    comShort(
      await dados(
        api.POST('/api/shorts/corte/{corte_id}', {
          ...doCorte(corteId),
          // O mesmo padrão do backend: sem título, nasce sem título.
          body: { titulo: '', ...body },
        }),
      ),
    ),

  listarDoCorte: async (corteId: string) =>
    comShorts(await dados(api.GET('/api/shorts/corte/{corte_id}', doCorte(corteId)))),

  /** D-507: os arranjos possíveis. Com `corteId`, diz o que as regiões dele permitem. */
  arranjosDePalco: (corteId = '') =>
    dados(api.GET('/api/shorts/palco/arranjos', { params: { query: corteId ? { corte_id: corteId } : {} } })),

  palcoDoCorte: (corteId: string) => dados(api.GET('/api/shorts/corte/{corte_id}/palco', doCorte(corteId))),

  escolherPreset: (corteId: string, presetId: string) =>
    dados(api.PUT('/api/shorts/corte/{corte_id}/palco', { ...doCorte(corteId), body: { preset_id: presetId } })),

  /** D-594: o gancho padrão do corte. O payload é lido pelo tipo do preset. */
  ganchoPadrao: async (corteId: string) =>
    (await dados(api.GET('/api/shorts/corte/{corte_id}/gancho-padrao', doCorte(corteId)))) as GanchoPadrao,

  definirGanchoPadrao: (corteId: string, presetId: string) =>
    dados(
      api.PUT('/api/shorts/corte/{corte_id}/gancho-padrao', { ...doCorte(corteId), body: { preset_id: presetId } }),
    ),

  /** D-594: todos os trechos voltam a seguir o padrão. O texto do gancho fica. */
  seguirGanchoPadrao: (corteId: string) =>
    dados(api.POST('/api/shorts/corte/{corte_id}/gancho-padrao/seguir', doCorte(corteId))),

  /**
   * D-541: os picos de áudio do BRUTO deste corte.
   *
   * NÃO é `/cortes/{id}/waveform-peaks`: aquele desenha o proxy da live, com
   * respiro antes e depois e os instantes deslocados por tudo o que foi
   * removido. A onda errada parece certa e manda cortar no lugar errado.
   */
  picosDoBruto: (corteId: string) =>
    dados(api.GET('/api/shorts/corte/{corte_id}/waveform-peaks', doCorte(corteId))),

  /** D-570: o palco que vale para todos os shorts deste corte. */
  palcoPadrao: (corteId: string) => dados(api.GET('/api/shorts/corte/{corte_id}/palco-padrao', doCorte(corteId))),

  definirPalcoPadrao: (corteId: string, presetId: string) =>
    dados(
      api.PUT('/api/shorts/corte/{corte_id}/palco-padrao', { ...doCorte(corteId), body: { preset_id: presetId } }),
    ),

  /** Todos os trechos voltam a seguir o palco padrão. Bordas e gancho ficam. */
  seguirPalcoPadrao: (corteId: string) =>
    dados(api.POST('/api/shorts/corte/{corte_id}/palco-padrao/seguir', doCorte(corteId))),

  /** D-568: o log do worker deste short — o que rodou e quanto levou. */
  logDoRender: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/log', doShort(shortId))),

  transcricaoDoCorte: (corteId: string) =>
    dados(api.GET('/api/shorts/corte/{corte_id}/transcricao', doCorte(corteId))),

  atualizar: async (shortId: string, body: AtualizarShortBody) =>
    comShort(
      await dados(api.PATCH('/api/shorts/{short_id}', { ...doShort(shortId), body: paraOCorpoDoShort(body) })),
    ),

  descartarBruto: (corteId: string) => dados(api.DELETE('/api/shorts/corte/{corte_id}/bruto', doCorte(corteId))),

  // D-485: os dois disparam e voltam na hora. Quem acompanha e o progresso.
  definirCenas: async (shortId: string, cenas: CenaShort[]) =>
    comShort(
      await dados(
        api.PUT('/api/shorts/{short_id}/cenas', {
          ...doShort(shortId),
          body: { cenas: cenas as unknown as Record<string, unknown>[] },
        }),
      ),
    ),

  /** D-497: a IA lê a transcrição do trecho e propõe os cartões — já gravados. */
  sugerirCenas: async (shortId: string, provider: ProviderIA = 'claude') =>
    comShort(await dados(api.POST('/api/shorts/{short_id}/cenas/sugerir', doShortComProvider(shortId, provider)))),

  /**
   * D-565: a IA propoe variacoes do gancho da abertura — e NAO grava.
   *
   * Diferente do `sugerirCenas`, que volta com o short ja alterado. Aqui o
   * retorno e so a lista: o operador compara e escolhe, e a gravacao passa pelo
   * PATCH normal. O gancho e a promessa do short, e escolher por ele seria a
   * decisao mais editorial da tela tomada pela maquina.
   */
  sugerirGanchos: (shortId: string, provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/shorts/{short_id}/ganchos', doShortComProvider(shortId, provider))),

  /** D-565 (onda 3): o texto de publicacao gravado deste short. */
  obterPost: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/post', doShort(shortId))),

  /** A IA escreve titulo, descricao e hashtags para o feed — e GRAVA. */
  gerarPost: (shortId: string, provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/shorts/{short_id}/post/gerar', doShortComProvider(shortId, provider))),

  /** A ultima palavra sobre o texto e do operador. "" apaga o campo. */
  atualizarPost: (shortId: string, body: AtualizarPostBody) =>
    dados(api.PATCH('/api/shorts/{short_id}/post', { ...doShort(shortId), body })),

  /** D-565 (onda 4): o quadro de capa gravado, e o instante sugerido. */
  obterCapa: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/capa', doShort(shortId))),

  /** Tira o quadro no instante escolhido e grava o caminho. */
  gerarCapa: (shortId: string, body: GerarCapaBody) =>
    dados(api.POST('/api/shorts/{short_id}/capa', { ...doShort(shortId), body })),

  /** D-581: o prompt da arte da capa ja escrito, ou "" quando ainda nao ha. */
  obterPromptDaCapa: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/capa/prompt', doShort(shortId))),

  /** D-581: pede o prompt da arte ao capista. Leva minutos — e uma chamada de IA. */
  gerarPromptDaCapa: (shortId: string, provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/shorts/{short_id}/capa/prompt', doShortComProvider(shortId, provider))),

  /** D-581: sobe a imagem desenhada como a capa deste short. */
  subirArteDaCapa: (shortId: string, arquivo: File) =>
    dados(api.POST('/api/shorts/{short_id}/capa/arte', { ...doShort(shortId), ...comoArquivo(arquivo) })),

  renderizarPrevia: (shortId: string) => dados(api.POST('/api/shorts/{short_id}/previa', doShort(shortId))),

  palcoDoShort: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/palco', doShort(shortId))),

  /** D-512: marca que o corte subiu para o TikTok — libera a limpeza do MP4. */
  confirmarTiktokHorizontal: (corteId: string) =>
    dados(api.POST('/api/shorts/corte/{corte_id}/publicar/tiktok-horizontal/confirmar', doCorte(corteId))),

  /** D-477: acha o rosto no trecho e centra o 9:16 nele — ja gravado. */
  enquadrarPeloRosto: async (shortId: string): Promise<VereditoDoRosto> =>
    comShort(await dados(api.POST('/api/shorts/{short_id}/enquadrar', doShort(shortId)))),

  /** D-499: as cores do canal oferecidas como fundo do short. */
  fundosDoPalco: () => dados(api.GET('/api/shorts/palco/fundos')),

  /**
   * D-500: o palco que ESTES ajustes dariam, sem gravar. Para o arraste.
   *
   * `palco` (D-594) é o palco inteiro de um RASCUNHO de preset: presente, ele
   * substitui o do trecho e o padrão do corte sai da conta. Nada é gravado.
   */
  simularPalco: (shortId: string, ajustes: Record<string, Retangulo>, palco?: Record<string, unknown>) =>
    dados(
      api.POST('/api/shorts/{short_id}/palco/simular', {
        ...doShort(shortId),
        body: { ajustes_palco: ajustes, palco: palco ?? null },
      }),
    ),

  progresso: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/progresso', doShort(shortId))),

  renderizar: (shortId: string) => dados(api.POST('/api/shorts/{short_id}/renderizar', doShort(shortId))),

  previaPublicacao: (shortId: string) => dados(api.GET('/api/shorts/{short_id}/publicacao', doShort(shortId))),

  /**
   * D-537: o robô faz os quatro passos repetitivos e para antes de publicar.
   *
   * Demora de propósito — ele espera o TikTok processar o vídeo, que num corte
   * longo leva minutos. Quem chama precisa mostrar isso, senão a tela parece
   * travada bem no passo em que ela mais parece. D-546: `vigiando` diz que o
   * backend ficou de olho na aba; D-580: `agendado_para`, já em português.
   * D-834: com `publicarSozinho` o robô aperta Publicar (RN-26) e volta `publicado`.
   */
  assistidoTiktokHorizontal: (
    corteId: string,
    envio: EnvioAssistido = { agendarPara: '', publicarSozinho: false },
  ) =>
    dados(
      api.POST('/api/shorts/corte/{corte_id}/publicar/tiktok-horizontal/assistido', {
        ...doCorte(corteId),
        body: { agendar_para: envio.agendarPara, publicar_sozinho: envio.publicarSozinho },
      }),
    ),

  /**
   * D-503: monta o pacote do corte para o TikTok, abre a pasta e devolve
   * legenda e URL de upload. D-517: `abrirPasta` existe para o LOTE — montar dez
   * pacotes abrindo dez exploradores seria pior que fazer à mão.
   */
  stagingTiktokHorizontal: (corteId: string, opcoes: { abrirPasta?: boolean } = {}) =>
    dados(
      api.POST('/api/shorts/corte/{corte_id}/publicar/tiktok-horizontal/staging', {
        ...doCorte(corteId),
        body: { abrir_pasta: opcoes.abrirPasta ?? true },
      }),
    ),

  // D-519/D-521: a capa VERTICAL do corte. Mora no router de shorts, e nao no de
  // metadados, porque ela so existe por causa do quadro 9:16 do TikTok.
  gerarCapaTiktok: (corteId: string, opcoes: { etiqueta?: string; origem?: 'ia' | 'frame' } = {}) =>
    dados(
      api.POST('/api/shorts/corte/{corte_id}/capa-tiktok', {
        ...doCorte(corteId),
        // `sugerir_etiqueta` vai com o mesmo `true` que o backend assume sem ele.
        body: { etiqueta: opcoes.etiqueta ?? '', origem: opcoes.origem ?? 'ia', sugerir_etiqueta: true },
      }),
    ),

  // D-524: o app escreve o prompt; quem desenha e o operador, no agente capista.
  gerarPromptCapaTiktok: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(
      api.POST('/api/shorts/corte/{corte_id}/capa-tiktok/prompt', {
        params: { path: { corte_id: corteId }, query: { provider } },
      }),
    ),

  subirArteCapaTiktok: (corteId: string, arquivo: File) =>
    dados(api.POST('/api/shorts/corte/{corte_id}/capa-tiktok/arte', { ...doCorte(corteId), ...comoArquivo(arquivo) })),

  subirCapaTiktok: (corteId: string, arquivo: File) =>
    dados(
      api.POST('/api/shorts/corte/{corte_id}/capa-tiktok/upload', { ...doCorte(corteId), ...comoArquivo(arquivo) }),
    ),

  publicar: (shortId: string, plataforma: string) =>
    dados(
      api.POST('/api/shorts/{short_id}/publicar/{plataforma}', {
        params: { path: { short_id: shortId, plataforma } },
      }),
    ),

  // ─── D-564: o lote ────────────────────────────────────────────

  /**
   * Dispara o lote. `alvos` vão prefixados por tipo ("short:uuid"), porque o
   * mesmo lote mistura o vertical do short e o 16:9 do corte.
   */
  criarLote: (alvos: string[], plataformas: string[], opcoes: OpcoesDoLote) =>
    dados(
      api.POST('/api/shorts/lote', {
        body: {
          alvos,
          plataformas,
          tiktok_assistido: opcoes.tiktokAssistido,
          instagram_assistido: opcoes.instagramAssistido,
          publicar_sozinho: opcoes.publicarSozinho,
          agendar_para: opcoes.agendarPara,
          republicar: opcoes.republicar,
        },
      }),
    ),

  verLote: () => dados(api.GET('/api/shorts/lote')),

  cancelarLote: () => dados(api.POST('/api/shorts/lote/cancelar')),

  /**
   * O "publiquei" do destino manual, onde o upload acontece longe daqui.
   *
   * D-603: serve tambem para declarar do zero — o item que deu erro e ele
   * terminou na mao no proprio app da rede. O backend cria o registro quando
   * nao existe, entao a tela nao precisa de um lote para poder marcar.
   */
  confirmarPublicacao: (alvoId: string, plataforma: string, url = '') =>
    dados(
      api.POST('/api/shorts/lote/confirmar', {
        // `alvo_tipo` vai com o mesmo "short" que o backend assume sem ele.
        body: { alvo_id: alvoId, plataforma, url, alvo_tipo: 'short' },
      }),
    ),

  /** D-611: a central — todo short pronto que ainda falta em alguma rede. */
  listarProntos: () => dados(api.GET('/api/shorts/prontos')),

  publicacoesDoCorte: (corteId: string) =>
    dados(api.GET('/api/shorts/corte/{corte_id}/publicacoes', doCorte(corteId))),

  sugerirAgora: async (corteId: string, provider: ProviderIA = 'claude') =>
    comShorts(
      await dados(
        api.POST('/api/shorts/corte/{corte_id}/sugerir', {
          params: { path: { corte_id: corteId }, query: { provider } },
        }),
      ),
    ),
};
