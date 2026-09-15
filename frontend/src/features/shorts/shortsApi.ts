// D-458: cliente HTTP da fábrica de shorts. Módulo próprio (NUNCA `lib/api.ts`,
// que está sob quatro locks sem relação com shorts), no mesmo padrão de
// `llmCallsApi`/`rankingPesosApi`. Aqui não há duplicação a temer: nenhuma
// função de shorts existe em `api.ts`, então nada fica órfão lá.

import type { GanchoShortPreset } from '@/types/presets';

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

/**
 * Os cabeçalhos de uma requisição — e a regra que a D-529 corrigiu.
 *
 * Com `FormData`, quem monta o `Content-Type` é o BROWSER: ele precisa incluir
 * o `boundary` que separa as partes. Declarar `application/json` por cima faz o
 * servidor tentar ler JSON num corpo multipart, e o campo do arquivo chega como
 * ausente — foi o 422 "Field required" ao subir a arte da capa.
 *
 * `lib/api.ts` já tinha essa guarda; este módulo nasceu antes de existir upload
 * aqui e ficou sem ela.
 */
export function cabecalhosDa(init?: RequestInit): HeadersInit {
  const ehFormData = init?.body instanceof FormData;
  return {
    ...(ehFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init?.headers ?? {}),
  };
}

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: cabecalhosDa(init),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  return (await res.json()) as T;
}

// ─── Contratos (espelham routers/shorts.py) ────────────────────────────────

export type StatusShort = 'sugerido' | 'aprovado' | 'rejeitado' | 'renderizado';

/** Os quatro tipos de cena vertical — espelha `cenas-shorts/schema.ts`. */
export type TipoCenaShort = 'hook' | 'numero' | 'citacao' | 'cta';

export interface CenaShort {
  tipo: TipoCenaShort;
  inicio: number;
  fim: number;
  texto: string;
  apoio?: string;
}

/** Quantos shorts o Fire tem, por estágio da curadoria. */
export interface ContagemShorts {
  total: number;
  sugerido: number;
  aprovado: number;
  rejeitado: number;
  renderizado: number;
}

/** Um corte Fire cujo bruto AINDA está em disco — só esses têm de onde recortar. */
export interface FireComBruto {
  corte_id: string;
  projeto_id: string;
  projeto_titulo: string;
  numero: number;
  titulo: string;
  tema_central: string;
  duracao_seg: number;
  /** D-502: sem bruto o corte AINDA aparece — a tela oferece regerar. */
  tem_bruto: boolean;
  live_em_disco: boolean;
  bruto_mb: number;
  is_fire: boolean;
  /** Indicado à mão, sem depender do Fire. */
  indicado: boolean;
  /** D-503: há MP4 final para publicar no TikTok? */
  tem_video_final: boolean;
  /** D-581: a mão humana já passou por aqui? Alimenta o filtro "onde eu parei".
   *  Opcional porque um backend ainda não reiniciado não manda o campo. */
  tem_edicao?: boolean;
  /** D-593: quando o operador declarou os shorts já publicados em todas as redes.
   *  `null` = ainda na fila. Opcional pelo mesmo motivo do `tem_edicao`. */
  finalizado_em?: string | null;
  shorts: ContagemShorts;
}

export interface ShortSugerido {
  id: string;
  corte_id: string;
  numero: number;
  titulo: string;
  /** O gancho de CURADORIA que a IA escreveu — vira a descricao do post. */
  gancho: string;
  /** D-565: o titulo-gancho que aparece na ABERTURA. Vazio = sem gancho. */
  gancho_tela: string;
  /** D-573: as últimas variações que a IA propôs para este short. */
  gancho_sugestoes: string[];
  /** D-565: quanto tempo o gancho fica em tela. 0 = o padrao. */
  gancho_ate_seg: number;
  /** D-581: hex da cor do gancho. Vazio = branco, como sempre foi. */
  gancho_cor: string;
  /** D-581: veu | caixa | contorno | sombra | nenhum. Vazio cai no veu. */
  gancho_realce: string;
  inicio_seg: number;
  fim_seg: number;
  duracao_seg: number;
  score: number;
  justificativa: string;
  status: StatusShort;
  /** Ajuste do operador (null = ainda seguindo o layout do corte). */
  foco_x: number | null;
  /** O enquadramento que o render vai usar de fato: ajuste ou layout. */
  foco_efetivo: number;
  arquivo_short_path: string;
  /** D-483: o MP4 sem filtro, para julgar antes de gastar a passada boa. */
  arquivo_previa_path: string;
  /** Arranjo escolhido pelo operador. Vazio = automático, deduzido das regiões. */
  /** D-507: como a tela é montada — "cheia", "dividida_empilhada", "dividida_insert". */
  arranjo_palco: string;
  /** D-507: em modo cheia, qual região preenche a janela. Vazio deduz. */
  janela_cheia: string;
  /** `ia` ou `manual`. O manual sobrevive a uma regeração. */
  origem: string;
  /** Preset DESTE short. Vazio = herda o do corte (D-498). */
  palco_preset: string;
  /** `faixas` ou `nenhuma` — a assinatura do canal em volta (D-501). */
  moldura: string;
  /** Slots que o operador moveu, como sobreposição parcial sobre o modelo. */
  ajustes_palco: Record<string, Retangulo>;
  /** D-499: recortes que ESTE short marcou sobre o quadro-fonte, em px do bruto. */
  recortes_palco: Record<string, Retangulo>;
  /** D-499: a CHAVE da paleta usada como fundo. Vazio = o default do canal. */
  fundo_palco: string;
  /** D-552: a TEXTURA do palco. Vazio = a padrão do canal. */
  fundo_editorial: string;
  /** D-563: hex da palavra corrente da legenda. Vazio = o acento do canal. */
  legenda_cor: string;
  /** D-563: família da fonte da legenda. Vazio = a do canal. */
  legenda_fonte: string;
  /** D-552: de qual preset de palco estes valores vieram. */
  palco_short_preset: string;
  /** Cenas desenhadas sobre o short, na timeline DELE (começa no zero). */
  cenas: CenaShort[];
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

/** A decisão da curadoria: só o que veio é aplicado. */
export interface AtualizarShortBody {
  status?: StatusShort;
  inicio_seg?: number;
  fim_seg?: number;
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
  palco_short_preset?: string;
  /** D-565: o titulo-gancho da abertura. "" apaga. */
  gancho_tela?: string;
  gancho_ate_seg?: number;
  /** D-581: a aparencia do gancho. "" na cor volta ao branco. */
  gancho_cor?: string;
  gancho_realce?: string;
}

/** D-565 (onda 3): o texto que acompanha o short no feed. */
export interface PostDoShortApi {
  titulo: string;
  descricao: string;
  hashtags: string[];
  /** Ja ha texto escrito? A tela usa isto para nao mostrar tres campos vazios
   *  que parecem defeito quando na verdade a etapa ainda nao rodou. */
  gerado: boolean;
}

export interface AtualizarPostBody {
  titulo?: string;
  descricao?: string;
  hashtags?: string[];
}

/** D-565 (onda 4): o quadro de capa do short. */
export interface CapaDoShortApi {
  capa_path: string;
  /** O gravado quando ha capa; o SUGERIDO quando ainda nao ha. */
  instante_seg: number;
  tem_capa: boolean;
  duracao_seg: number;
  /** Ate onde o gancho aparece — a regua marca esse bloco. */
  gancho_ate_seg: number;
}

export interface GerarCapaBody {
  instante_seg?: number;
}

/** URL do bruto do corte — reusa o redirect com cache-buster de `/cortes`. */
export function brutoUrl(corteId: string): string {
  return `${API_BASE}/cortes/${corteId}/video-bruto`;
}

/** Como a tela do short pode ser montada (D-507). */
export interface ArranjoPalco {
  /** O que se grava: "cheia", "dividida_empilhada", "dividida_insert". */
  chave: string;
  modo: 'cheia' | 'dividida';
  disposicao: string;
  nome: string;
  porque: string;
  janelas: number;
  /** `false` quando as regiões deste corte não comportam o arranjo. */
  possivel: boolean;
  /** O que falta marcar para ele passar a servir. Vazio quando é possível. */
  impedimento: string;
}

/** De onde saem as regiões deste corte. */
export interface EstadoPalco {
  preset: string;
  origem: 'recorte_do_short' | 'preset_do_short' | 'preset' | 'layout_do_corte' | 'nenhuma';
  regioes: Record<string, { x: number; y: number; w: number; h: number }>;
  arranjo_sugerido: string;
  presets_disponiveis: { id: string; nome: string; regioes: string[] }[];
}

/** Um retângulo em pixels. */
export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Um recorte em coordenadas de desenho: de onde tirar, onde colar, onde cortar. */
export interface RecorteDesenhavel {
  /** D-499: qual bloco é este. Vem junto para a tela não casar por posição. */
  regiao: string;
  origem: Retangulo;
  destino: Retangulo;
  recorta: Retangulo;
}

/** O palco de um short, pronto para o canvas. Calculado no backend. */
export interface PlanoDesenhavel {
  origem:
    | 'recorte_do_short'
    | 'palco_padrao_do_corte'
    | 'preset_do_short'
    | 'preset'
    | 'layout_do_corte'
    | 'nenhuma';
  modelo: string | null;
  /** O arranjo RESOLVIDO — com a herança do palco padrão. Vazio sem palco. */
  arranjo?: string;
  /** Os arranjos que as regiões DESTE trecho permitem (as do corte não bastam). */
  arranjos?: ArranjoPalco[];
  /** TODAS as regiões do trecho, em pixels do bruto — não só as do arranjo. */
  regioes?: Record<string, Retangulo>;
  canvas: { largura: number; altura: number };
  fundo: string;
  /** D-549: a TEXTURA do palco — o mesmo id que o render manda para o PNG. */
  fundo_editorial: string;
  recortes: RecorteDesenhavel[];
  /** Slots RESOLVIDOS (modelo + ajuste) — o que o editor arrasta. */
  slots: Record<string, Retangulo>;
  /** Regiões que o operador moveu; as demais herdam do modelo. */
  ajustados: string[];
  moldura: string;
  /** As faixas já resolvidas, com a cor do CANAL — a tela só desenha. */
  faixas: (Retangulo & { cor: string })[];
  /** D-585: a aparência do gancho, JÁ com a herança do corte resolvida. */
  gancho_cor?: string;
  gancho_realce?: string;
  /** D-594: o resto da aparência herdada. 0/'' = o de sempre. */
  gancho_ate_seg?: number;
  gancho_fonte?: string;
  gancho_tamanho?: number;
}

/** O que o detector de rosto viu num trecho (D-477). */
export interface VereditoDoRosto {
  short: ShortSugerido;
  /** `false` NÃO é erro: é o detector dizendo que não viu rosto suficiente. */
  achou: boolean;
  foco_x: number | null;
  motivo: string;
  quadros_analisados: number;
  quadros_com_rosto: number;
  /** Preenchido quando a pessoa se move muito e um foco fixo é meio-termo. */
  aviso: string;
}

/** Uma cor do canal oferecível como fundo do short (D-499). */
export interface FundoDoCanal {
  /** O que se grava. A cor pode mudar quando o canal trocar o tema. */
  chave: string;
  cor: string;
  padrao: boolean;
}

/** Um passo do render e onde ele está. */
export interface PassoRender {
  chave: string;
  label: string;
  status: 'pendente' | 'rodando' | 'concluido' | 'erro';
}

/** O render em curso (ou o último deste processo). */
export interface PalcoPadrao {
  /** Id do preset escolhido. Vazio = o corte não tem palco padrão. */
  palco_padrao: string;
  /** O nome dele, para a tela não ter que cruzar a lista. */
  nome: string;
  disponiveis: { id: string; nome: string }[];
  /** Trechos com palco próprio — eles não seguem o padrão. */
  customizados: number;
}

/** D-594: o gancho padrão do corte — a aparência que todos os trechos herdam. */
export interface GanchoPadrao {
  /** Id do preset escolhido. Vazio = cada trecho decide. */
  gancho_padrao: string;
  nome: string;
  /** O payload do escolhido, para o modal do trecho mostrar "do padrão". */
  payload: Partial<GanchoShortPreset>;
  disponiveis: { id: string; nome: string }[];
  /** Trechos com aparência própria — eles não seguem o padrão. */
  customizados: number;
}

export interface LogDoRender {
  linhas: string[];
  /** Houve mais linhas do que as devolvidas. */
  truncado: boolean;
  /** Uma duração por passo concluído, na ordem em que saíram. */
  duracoes_ms: number[];
  /** `false` enquanto nenhum passo foi despachado. */
  existe: boolean;
}

export interface ProgressoRender {
  estagio: 'previa' | 'final';
  concluido: boolean;
  erro: string | null;
  decorrido_seg: number;
  passos: PassoRender[];
}

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

export interface PacotePublicacao {
  plataforma: string;
  rotulo: string;
  modo: 'api' | 'manual';
  titulo: string;
  titulo_visivel: string;
  descricao: string;
  hashtags: string[];
  avisos: string[];
}

/** O que volta de um publicar avulso: `url` pela API, `pasta` no pacote manual. */
export interface ResultadoPublicacao {
  url?: string;
  pasta?: string;
  /** D-588: o que deu errado sem derrubar o upload — hoje, a capa. */
  avisos?: string[];
}

// ─── D-564: o lote — vários shorts, várias plataformas, cada uma no seu passo ──

/** O estado de um item na raia. Espelha `EstadoItem` do domínio. */
export type EstadoItemLote =
  | 'aguardando'
  | 'preparando'
  | 'sua_vez'
  | 'publicado'
  | 'erro'
  | 'pulado'
  | 'cancelado';

export interface ItemDoLote {
  alvo_tipo: 'short' | 'corte';
  alvo_id: string;
  plataforma: string;
  plataforma_rotulo: string;
  rotulo: string;
  estado: EstadoItemLote;
  detalhe: string;
  url: string;
}

/**
 * Uma plataforma dentro do lote, com seus itens.
 *
 * `exige_humano` é o que faz a raia do TikTok e a do Instagram serem desenhadas
 * diferente: nelas o fim da máquina não é o fim do trabalho.
 */
export interface RaiaDoLote {
  plataforma: string;
  rotulo: string;
  exige_humano: boolean;
  aviso: string;
  itens: ItemDoLote[];
}

export interface LotePublicacao {
  lote_id: string;
  criado_em: string;
  cancelado: boolean;
  terminou: boolean;
  /** D-564: o robô do TikTok subiu pelo Chrome, em vez de só montar a pasta. */
  tiktok_assistido: boolean;
  /** D-564: o mesmo robô, no compositor do instagram.com. */
  instagram_assistido: boolean;
  /** D-564: e também apertou o Publicar. */
  publicar_sozinho: boolean;
  /** D-580: para quando o lote foi marcado, ou vazio. */
  agendar_para?: string;
  raias: RaiaDoLote[];
}

/** As escolhas que mudam COMO o TikTok é publicado neste lote. */
export interface OpcoesDoLote {
  tiktokAssistido: boolean;
  instagramAssistido: boolean;
  publicarSozinho: boolean;
  /** D-580: `AAAA-MM-DDTHH:mm` no relógio do operador. Vazio = publicar agora. */
  agendarPara: string;
  /** D-590: sobe de novo o que já foi publicado, em vez de pular. */
  republicar: boolean;
}

/** Uma publicação já registrada — o que a tela de seleção usa para nascer sabendo. */
export interface PublicacaoRegistrada {
  alvo_id: string;
  plataforma: string;
  estado: EstadoItemLote;
  url: string;
  detalhe: string;
  publicado_em: string;
}

/** Uma palavra com tempo, na timeline do BRUTO. */
export interface PalavraTranscrita {
  texto: string;
  inicio_seg: number;
  fim_seg: number;
}

/** As palavras do bruto + de onde vieram (`auto_legenda` ou `asr_local`). */
export interface TranscricaoDoBruto {
  fonte: string;
  palavras: PalavraTranscrita[];
}

/** O que a tela do bruto precisa saber para oferecer (ou nao) a fabrica. */
export interface ElegibilidadeShorts {
  is_fire: boolean;
  candidato_shorts: boolean;
  /** Fire OU indicado — a tela pergunta uma coisa só. */
  elegivel: boolean;
  tem_bruto: boolean;
  total_shorts: number;
}

export const shortsApi = {
  listarFires: () => request<{ fires: FireComBruto[] }>('/shorts/fires'),

  indicarParaShorts: (corteId: string, indicado: boolean) =>
    request<ElegibilidadeShorts>(`/shorts/corte/${corteId}/indicar`, {
      method: 'POST',
      body: JSON.stringify({ indicado }),
    }),

  /** D-593: tira o corte da fila (shorts já nas redes) ou o devolve a ela. */
  marcarFinalizado: (corteId: string, finalizado: boolean) =>
    request<{ corte_id: string; finalizado_em: string | null }>(
      `/shorts/corte/${corteId}/finalizado`,
      { method: 'PUT', body: JSON.stringify({ finalizado }) },
    ),

  elegibilidade: (corteId: string) =>
    request<ElegibilidadeShorts>(`/shorts/corte/${corteId}/elegibilidade`),

  gerarManualmente: (corteId: string) =>
    request<{ shorts: ShortSugerido[]; descartes: string[]; bruto_regerado: boolean }>(
      `/shorts/corte/${corteId}/gerar`,
      { method: 'POST' },
    ),

  criarManual: (corteId: string, body: { inicio_seg: number; fim_seg: number; titulo?: string }) =>
    request<{ short: ShortSugerido }>(`/shorts/corte/${corteId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listarDoCorte: (corteId: string) =>
    request<{ shorts: ShortSugerido[] }>(`/shorts/corte/${corteId}`),

  /** D-507: os arranjos possíveis. Com `corteId`, diz o que as regiões dele permitem. */
  arranjosDePalco: (corteId = '') =>
    request<{ arranjos: ArranjoPalco[] }>(
      `/shorts/palco/arranjos${corteId ? `?corte_id=${corteId}` : ''}`,
    ),

  palcoDoCorte: (corteId: string) => request<EstadoPalco>(`/shorts/corte/${corteId}/palco`),

  escolherPreset: (corteId: string, presetId: string) =>
    request<EstadoPalco>(`/shorts/corte/${corteId}/palco`, {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId }),
    }),

  /** D-594: o gancho padrão do corte. */
  ganchoPadrao: (corteId: string) =>
    request<GanchoPadrao>(`/shorts/corte/${corteId}/gancho-padrao`),

  definirGanchoPadrao: (corteId: string, presetId: string) =>
    request<{ gancho_padrao: string }>(`/shorts/corte/${corteId}/gancho-padrao`, {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId }),
    }),

  /** D-594: todos os trechos voltam a seguir o padrão. O texto do gancho fica. */
  seguirGanchoPadrao: (corteId: string) =>
    request<{ liberados: number }>(`/shorts/corte/${corteId}/gancho-padrao/seguir`, {
      method: 'POST',
    }),

  /**
   * D-541: os picos de áudio do BRUTO deste corte.
   *
   * NÃO é `/cortes/{id}/waveform-peaks`: aquele desenha o proxy da live, com
   * respiro antes e depois e os instantes deslocados por tudo o que foi
   * removido. A onda errada parece certa e manda cortar no lugar errado.
   */
  picosDoBruto: (corteId: string) =>
    request<{
      duration_sec: number;
      points: number;
      peaks: number[];
    }>(`/shorts/corte/${corteId}/waveform-peaks`),

  /** D-570: o palco que vale para todos os shorts deste corte. */
  palcoPadrao: (corteId: string) =>
    request<PalcoPadrao>(`/shorts/corte/${corteId}/palco-padrao`),

  definirPalcoPadrao: (corteId: string, presetId: string) =>
    request<{ palco_padrao: string }>(`/shorts/corte/${corteId}/palco-padrao`, {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId }),
    }),

  /** Todos os trechos voltam a seguir o palco padrão. Bordas e gancho ficam. */
  seguirPalcoPadrao: (corteId: string) =>
    request<{ liberados: number }>(`/shorts/corte/${corteId}/palco-padrao/seguir`, {
      method: 'POST',
    }),

  /** D-568: o log do worker deste short — o que rodou e quanto levou. */
  logDoRender: (shortId: string) =>
    request<LogDoRender>(`/shorts/${shortId}/log`),

  transcricaoDoCorte: (corteId: string) =>
    request<TranscricaoDoBruto>(`/shorts/corte/${corteId}/transcricao`),

  atualizar: (shortId: string, body: AtualizarShortBody) =>
    request<{ short: ShortSugerido }>(`/shorts/${shortId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  descartarBruto: (corteId: string) =>
    request<{ liberado_mb: number; removidos: string[]; erros: string[] }>(
      `/shorts/corte/${corteId}/bruto`,
      { method: 'DELETE' },
    ),

  // D-485: os dois disparam e voltam na hora. Quem acompanha e o progresso.
  definirCenas: (shortId: string, cenas: CenaShort[]) =>
    request<{ short: ShortSugerido }>(`/shorts/${shortId}/cenas`, {
      method: 'PUT',
      body: JSON.stringify({ cenas }),
    }),

  /** D-497: a IA lê a transcrição do trecho e propõe os cartões — já gravados. */
  sugerirCenas: (shortId: string) =>
    request<{ short: ShortSugerido; descartes: string[] }>(`/shorts/${shortId}/cenas/sugerir`, {
      method: 'POST',
    }),

  /**
   * D-565: a IA propoe variacoes do gancho da abertura — e NAO grava.
   *
   * Diferente do `sugerirCenas`, que volta com o short ja alterado. Aqui o
   * retorno e so a lista: o operador compara e escolhe, e a gravacao passa pelo
   * PATCH normal. O gancho e a promessa do short, e escolher por ele seria a
   * decisao mais editorial da tela tomada pela maquina.
   */
  sugerirGanchos: (shortId: string) =>
    request<{ variacoes: string[] }>(`/shorts/${shortId}/ganchos`, {
      method: 'POST',
    }),

  /** D-565 (onda 3): o texto de publicacao gravado deste short. */
  obterPost: (shortId: string) => request<PostDoShortApi>(`/shorts/${shortId}/post`),

  /** A IA escreve titulo, descricao e hashtags para o feed — e GRAVA. */
  gerarPost: (shortId: string) =>
    request<PostDoShortApi>(`/shorts/${shortId}/post/gerar`, { method: 'POST' }),

  /** A ultima palavra sobre o texto e do operador. "" apaga o campo. */
  atualizarPost: (shortId: string, body: AtualizarPostBody) =>
    request<PostDoShortApi>(`/shorts/${shortId}/post`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  /** D-565 (onda 4): o quadro de capa gravado, e o instante sugerido. */
  obterCapa: (shortId: string) => request<CapaDoShortApi>(`/shorts/${shortId}/capa`),

  /** Tira o quadro no instante escolhido e grava o caminho. */
  gerarCapa: (shortId: string, body: GerarCapaBody) =>
    request<{ capa_path: string; instante_seg: number; tem_capa: boolean }>(
      `/shorts/${shortId}/capa`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** D-581: o prompt da arte da capa ja escrito, ou "" quando ainda nao ha. */
  obterPromptDaCapa: (shortId: string) =>
    request<{ prompt: string }>(`/shorts/${shortId}/capa/prompt`),

  /** D-581: pede o prompt da arte ao capista. Leva minutos — e uma chamada de IA. */
  gerarPromptDaCapa: (shortId: string) =>
    request<{ prompt: string }>(`/shorts/${shortId}/capa/prompt`, { method: 'POST' }),

  /** D-581: sobe a imagem desenhada como a capa deste short. */
  subirArteDaCapa: (shortId: string, arquivo: File) => {
    const form = new FormData();
    form.append('arquivo', arquivo);
    // Sem `Content-Type` proprio: com FormData quem monta o cabecalho (com o
    // boundary) e o BROWSER — o `cabecalhosDa` ja cuida disso desde a D-529.
    return request<{ capa_path: string; instante_seg: number; tem_capa: boolean }>(
      `/shorts/${shortId}/capa/arte`,
      { method: 'POST', body: form },
    );
  },

  renderizarPrevia: (shortId: string) =>
    request<{ status: string; estagio: string }>(`/shorts/${shortId}/previa`, {
      method: 'POST',
    }),

  palcoDoShort: (shortId: string) => request<PlanoDesenhavel>(`/shorts/${shortId}/palco`),

  /** D-512: marca que o corte subiu para o TikTok — libera a limpeza do MP4. */
  confirmarTiktokHorizontal: (corteId: string) =>
    request<{ tiktok_publicado_em: string }>(
      `/shorts/corte/${corteId}/publicar/tiktok-horizontal/confirmar`,
      { method: 'POST' },
    ),

  /** D-477: acha o rosto no trecho e centra o 9:16 nele — ja gravado. */
  enquadrarPeloRosto: (shortId: string) =>
    request<VereditoDoRosto>(`/shorts/${shortId}/enquadrar`, { method: 'POST' }),

  /** D-499: as cores do canal oferecidas como fundo do short. */
  fundosDoPalco: () => request<{ fundos: FundoDoCanal[] }>('/shorts/palco/fundos'),

  /** D-500: o palco que ESTES ajustes dariam, sem gravar. Para o arraste. */
  /**
   * `palco` (D-594) é o palco inteiro de um RASCUNHO de preset: presente, ele
   * substitui o do trecho e o padrão do corte sai da conta. Nada é gravado.
   */
  simularPalco: (
    shortId: string,
    ajustes: Record<string, Retangulo>,
    palco?: Record<string, unknown>,
  ) =>
    request<PlanoDesenhavel>(`/shorts/${shortId}/palco/simular`, {
      method: 'POST',
      body: JSON.stringify({ ajustes_palco: ajustes, palco: palco ?? null }),
    }),

  progresso: (shortId: string) =>
    request<{ render: ProgressoRender | null }>(`/shorts/${shortId}/progresso`),

  renderizar: (shortId: string) =>
    request<{ status: string; estagio: string }>(`/shorts/${shortId}/renderizar`, {
      method: 'POST',
    }),

  previaPublicacao: (shortId: string) =>
    request<{ pacotes: PacotePublicacao[] }>(`/shorts/${shortId}/publicacao`),

  /** D-503: monta o pacote, abre a pasta, e devolve legenda + URL de upload. */
  /**
   * Monta o pacote do corte para o TikTok.
   *
   * D-517: `abrirPasta` existe para o LOTE — montar dez pacotes abrindo dez
   * exploradores seria pior que fazer à mão. No clique de uma linha só ela
   * continua abrindo, que é o passo que leva o operador ao upload.
   */
  /**
   * D-537: o robô faz os quatro passos repetitivos e para antes de publicar.
   *
   * Demora de propósito — ele espera o TikTok processar o vídeo, que num corte
   * longo leva minutos. Quem chama precisa mostrar isso, senão a tela parece
   * travada bem no passo em que ela mais parece.
   */
  assistidoTiktokHorizontal: (corteId: string, agendarPara = '') =>
    request<{
      passos: string[];
      resumo: string;
      capa_aplicada: boolean;
      avisos: string[];
      publicado: boolean;
      chrome_aberto_agora: boolean;
      legenda: string;
      pasta: string;
      /** D-546: o backend ficou de olho na aba esperando o Publicar. */
      vigiando: boolean;
      /** D-580: para quando ficou marcado, já em português. */
      agendado_para: string;
    }>(`/shorts/corte/${corteId}/publicar/tiktok-horizontal/assistido`, {
      method: 'POST',
      body: JSON.stringify({ agendar_para: agendarPara }),
    }),

  stagingTiktokHorizontal: (corteId: string, opcoes: { abrirPasta?: boolean } = {}) =>
    request<{
      pasta: string;
      video: string;
      pasta_aberta: boolean;
      erro_ao_abrir: string | null;
      url_upload: string;
      titulo?: string;
      descricao?: string;
      hashtags?: string[];
    }>(`/shorts/corte/${corteId}/publicar/tiktok-horizontal/staging`, {
      method: 'POST',
      body: JSON.stringify({ abrir_pasta: opcoes.abrirPasta ?? true }),
    }),

  // D-519/D-521: a capa VERTICAL do corte. Mora no router de shorts, e nao no de
  // metadados, porque ela so existe por causa do quadro 9:16 do TikTok.
  gerarCapaTiktok: (corteId: string, opcoes: { etiqueta?: string; origem?: 'ia' | 'frame' } = {}) =>
    request<{ capa: string; nome: string; etiqueta: string }>(
      `/shorts/corte/${corteId}/capa-tiktok`,
      {
        method: 'POST',
        body: JSON.stringify({
          etiqueta: opcoes.etiqueta ?? '',
          origem: opcoes.origem ?? 'ia',
        }),
      },
    ),

  // D-524: o app escreve o prompt; quem desenha e o operador, no agente capista.
  gerarPromptCapaTiktok: (corteId: string) =>
    request<{ prompt: string }>(`/shorts/corte/${corteId}/capa-tiktok/prompt`, {
      method: 'POST',
    }),

  subirArteCapaTiktok: (corteId: string, arquivo: File) => {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    return request<{ capa: string; nome: string }>(`/shorts/corte/${corteId}/capa-tiktok/arte`, {
      method: 'POST',
      body: formData,
    });
  },

  subirCapaTiktok: (corteId: string, arquivo: File) => {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    return request<{ capa: string; nome: string }>(`/shorts/corte/${corteId}/capa-tiktok/upload`, {
      method: 'POST',
      body: formData,
    });
  },

  publicar: (shortId: string, plataforma: string) =>
    request<ResultadoPublicacao>(`/shorts/${shortId}/publicar/${plataforma}`, {
      method: 'POST',
    }),

  // ─── D-564: o lote ────────────────────────────────────────────

  /**
   * Dispara o lote. `alvos` vão prefixados por tipo ("short:uuid"), porque o
   * mesmo lote mistura o vertical do short e o 16:9 do corte.
   */
  criarLote: (alvos: string[], plataformas: string[], opcoes: OpcoesDoLote) =>
    request<LotePublicacao>('/shorts/lote', {
      method: 'POST',
      body: JSON.stringify({
        alvos,
        plataformas,
        tiktok_assistido: opcoes.tiktokAssistido,
        instagram_assistido: opcoes.instagramAssistido,
        publicar_sozinho: opcoes.publicarSozinho,
        agendar_para: opcoes.agendarPara,
        republicar: opcoes.republicar,
      }),
    }),

  verLote: () => request<{ lote: LotePublicacao | null }>('/shorts/lote'),

  cancelarLote: () =>
    request<{ cancelado: boolean; lote: LotePublicacao | null }>('/shorts/lote/cancelar', {
      method: 'POST',
    }),

  /** O "publiquei" do destino manual, onde o upload acontece longe daqui. */
  confirmarPublicacao: (alvoId: string, plataforma: string) =>
    request<{ confirmado: boolean }>('/shorts/lote/confirmar', {
      method: 'POST',
      body: JSON.stringify({ alvo_id: alvoId, plataforma }),
    }),

  publicacoesDoCorte: (corteId: string) =>
    request<{ publicacoes: PublicacaoRegistrada[] }>(`/shorts/corte/${corteId}/publicacoes`),

  sugerirAgora: (corteId: string) =>
    request<{ shorts: ShortSugerido[]; descartes: string[] }>(`/shorts/corte/${corteId}/sugerir`, {
      method: 'POST',
    }),
};
