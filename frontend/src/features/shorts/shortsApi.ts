// D-458: cliente HTTP da fábrica de shorts. Módulo próprio (NUNCA `lib/api.ts`,
// que está sob quatro locks sem relação com shorts), no mesmo padrão de
// `llmCallsApi`/`rankingPesosApi`. Aqui não há duplicação a temer: nenhuma
// função de shorts existe em `api.ts`, então nada fica órfão lá.

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
  /** D-565: quanto tempo o gancho fica em tela. 0 = o padrao. */
  gancho_ate_seg: number;
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
  palco_short_preset?: string;
  /** D-565: o titulo-gancho da abertura. "" apaga. */
  gancho_tela?: string;
  gancho_ate_seg?: number;
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
  origem: 'preset_do_short' | 'preset' | 'layout_do_corte' | 'nenhuma';
  modelo: string | null;
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
  simularPalco: (shortId: string, ajustes: Record<string, Retangulo>) =>
    request<PlanoDesenhavel>(`/shorts/${shortId}/palco/simular`, {
      method: 'POST',
      body: JSON.stringify({ ajustes_palco: ajustes }),
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
  assistidoTiktokHorizontal: (corteId: string) =>
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
    }>(`/shorts/corte/${corteId}/publicar/tiktok-horizontal/assistido`, {
      method: 'POST',
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
    request<Record<string, unknown>>(`/shorts/${shortId}/publicar/${plataforma}`, {
      method: 'POST',
    }),

  sugerirAgora: (corteId: string) =>
    request<{ shorts: ShortSugerido[]; descartes: string[] }>(`/shorts/corte/${corteId}/sugerir`, {
      method: 'POST',
    }),
};
