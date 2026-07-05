// Espelha frontend/src/app/models/models.ts (Angular).
// Mantenha ambos sincronizados durante a migração.

export type StatusProjeto =
  | 'pendente'
  | 'baixando'
  | 'transcrevendo'
  | 'pronto'
  | 'analisando'
  | 'analisado'
  | 'erro';

export type StatusCorte = 'proposto' | 'aprovado' | 'rejeitado' | 'editado' | 'processado';

// I-034: audit trail da última análise IA do projeto.
export interface AuditoriaCorteItem {
  id: string;
  numero: number;
  titulo_proposto: string;
  tema_central: string;
  justificativa: string;
  inicio_hms: string;
  fim_hms: string;
  duracao_min: number;
  status: StatusCorte;
}

export interface AuditoriaDescartado {
  tema: string;
  motivo: string;
}

export interface AuditoriaAnaliseResponse {
  projeto_id: string;
  ultima_analise_em: string | null;
  total_cortes: number;
  duracao_media_min: number;
  cortes: AuditoriaCorteItem[];
  descartados: AuditoriaDescartado[];
}

export type FontePreset = 'atual' | 'moderna' | 'cientifica' | 'minimalista' | 'tecnica';

export interface Projeto {
  id: string;
  youtube_url: string;
  titulo_live: string;
  canal_origem: string;
  duracao_segundos: number;
  data_live: string; // YYYYMMDD
  status: StatusProjeto;
  progresso_download: number;
  arquivo_video_path: string;
  arquivos_limpos: boolean;
  criado_em: string;
  ultima_analise_em: string | null;
  /** Renderer das cenas Remotion deste projeto: "v1" (estável) ou "v2" (nova identidade). */
  versao_renderer: 'v1' | 'v2';
  /** Sombra padrão para cenas v2 com sombra_nivel='auto'. */
  sombra_nivel_padrao: 'nenhuma' | 'leve' | 'media' | 'forte';
  layout_card_padrao: 'horizontal' | 'vertical';
  layout_youtube_padrao: string | null;
  fonte_preset: FontePreset;
  /** F-052: pontuação herdada do ranking de lives. 0 quando não veio do ranking. */
  pontuacao_ranking: number;
  total_cortes: number;
  total_publicados: number;
  total_aprovados: number;
  total_com_raw: number;
  total_com_meta: number;
  total_video_pronto: number;
  total_publicos: number;
  proxima_publicacao: string;
}

// F-054: status de um segmento detectado automaticamente.
export type StatusSegmentoDetectado =
  | 'sugerido'
  | 'aceito_full'
  | 'aceito_compartilhada'
  | 'rejeitado';

export interface SegmentoDetectado {
  inicio: number;
  fim: number;
  score: number;
  status: StatusSegmentoDetectado;
}

export type DecisaoSegmentoDetectado = 'rejeitar' | 'full' | 'compartilhada';

export type DesvioOrigem = 'claude' | 'manual' | 'gemini' | 'n8n' | 'tecnico';

export interface Desvio {
  inicio_hms: string;
  fim_hms: string;
  motivo: string;
  /** Procedência editorial do desvio. Opcional p/ retrocompatibilidade
   *  com desvios persistidos antes do I-020. */
  origem?: DesvioOrigem;
}

export interface TranscricaoLinha {
  start: number;
  end: number;
  texto: string;
}

export interface Corte {
  id: string;
  projeto_id: string;
  numero: number;
  titulo_proposto: string;
  resumo: string;
  tema_central: string;
  /** I-034: justificativa editorial da IA (audit trail). 1-3 frases
   * explicando POR QUE o intervalo virou corte e por que a duração escolhida
   * é a certa. Opcional para retrocompatibilidade com cortes antigos. */
  justificativa?: string;
  inicio_hms: string;
  fim_hms: string;
  inicio_seg: number;
  fim_seg: number;
  desvios: Desvio[];
  status: StatusCorte;
  arquivo_clip_path: string;
  /** Duração real (segundos) do clip bruto, medida via ffprobe pelo backend.
   * 0 quando o clip ainda não foi gerado.  Quando > 0, deve ser usado como
   * duração canônica do Player (evita estimativas que acumulam drift). */
  duracao_clip_seg?: number;
  /** F-063: offset fino de áudio (lip-sync), em milissegundos. Positivo atrasa
   * o áudio; negativo adianta. Aplicado na geração do bruto e propaga ao render
   * final. 0/ausente = sem ajuste. */
  audio_offset_ms?: number;
  youtube_video_id: string;
  youtube_url_publicado: string;
  youtube_scheduled_at: string;
  is_leitura: boolean;
  autor_leitura: string;
  parte_leitura: number;
  is_fire: boolean;
  /** Backend serializa como int 0/1 (coluna SQLite Integer). */
  is_pos_producao?: 0 | 1;
  /** Backend serializa como int 0/1: marca manual do editor de que as cenas foram revisadas. */
  cenas_validadas?: 0 | 1;
  /** Timestamp ISO da ultima validacao manual das cenas; null se nao validadas. */
  cenas_validadas_em?: string | null;
  cenas_remotion?: unknown;
  layout_youtube?: unknown;
  /** F-054: sugestões de mudança de cena detectadas pelo PySceneDetect no
   * bruto do corte. Vazio quando a detecção ainda não rodou (corte legado
   * ou bruto recém-gerado antes do scan terminar). */
  segmentos_detectados?: SegmentoDetectado[];
  transcricao_corte?: TranscricaoLinha[];
  /** Transcricao limpa: sem duplicacao, com tempos remapeados para o video bruto (sem trechos). */
  transcricao_final?: TranscricaoLinha[];
  /** Texto puro da transcricao limpa, pronto para alimentar prompts de IA. */
  transcricao_final_texto?: string;
  /** F-058: influência manual do editor no prompt da thumbnail. Texto livre
   * (pessoas a destacar, relações, ênfases) somado ao raciocínio do capista
   * quando o prompt da capa é gerado. Vazio = sem influência. */
  hints_thumbnail?: string;
  criado_em: string;
}

export interface StatusBrutoResponse {
  status: 'idle' | 'processando' | 'concluido' | 'erro' | string;
  clip_gerado: boolean;
  clip_path: string;
}

export interface PipelineStatusResponse {
  fases: {
    raw: boolean;
    grade: boolean;
    overlays: boolean;
    compose: boolean;
    encode: boolean;
  };
  overlays_count: number;
  tem_etapas_concluidas: boolean;
  state?: 'idle' | 'running' | 'done' | 'error';
  progress?: number;
  stage?: string;
  running?: boolean;
  elapsed_seconds?: number;
  error?: string;
}

export type ProgressoUpdate =
  | { status: 'baixando'; progresso: number }
  | { status: 'transcrevendo'; progresso?: number }
  | { status: 'pronto'; progresso: number }
  | { status: 'erro'; mensagem: string }
  | { status: 'sem_progresso'; mensagem: string };

export interface WaveformPeaksResponse {
  corte_id: string;
  offset_sec: number;
  duration_sec: number;
  sample_rate: number;
  points: number;
  peaks: number[];
  cached: boolean;
}

export interface AdicionarDesvioRequest {
  inicio_hms: string;
  fim_hms: string;
  motivo: string;
}

export type CenaTipo =
  | 'tela_cheia'
  | 'barra_inferior'
  | 'card_informacao'
  | 'destaque_numerico'
  | 'comparativo_contraponto'
  | 'comparativo_enfase'
  | 'enfase'
  | 'pergunta_transicao'
  | 'chamada_final'
  | 'ficha_biografica'
  | 'marco_historico'
  | 'citacao_autor'
  | 'linha_tempo'
  | 'definicao_termo'
  | 'fonte_referencia'
  | 'lista_enumerada'
  | 'mostrar_imagem';

export interface CenaRemotion {
  tipo: CenaTipo;
  inicio: number;
  fim: number;
  texto?: string;
  /** Nome curto para exibicao em ficha_biografica quando texto for longo. */
  nome_curto?: string;
  subtexto?: string;
  icone?: string;
  numero?: number;
  contexto?: string;
  rotuloA?: string;
  rotuloB?: string;
  mascotMood?: string;
  mascotPosicao?: string;
  mascotTamanho?: string;
  autor?: string;
  obra?: string;
  ano?: string;
  fonte?: string;
  marcos?: Array<{ data: string; titulo: string; detalhe?: string }>;
  itens?: Array<{ titulo: string; detalhe?: string }>;
  textura?: string;
  url?: string;
  cor?: string;
  /** URL da foto do personagem em ficha_biografica (relativa ou absoluta). */
  retrato_url?: string;
  /** Nível de sombra/overlay da cena v2. `auto` = usa o sombra_nivel_padrao do projeto. */
  sombra_nivel?: 'auto' | 'nenhuma' | 'leve' | 'media' | 'forte';
  layout_card?: 'auto' | 'horizontal' | 'vertical';
  modelo_cena?: 'auto' | 'padrao' | 'card';
}

export interface CenasRemotionPayload {
  formato?: string;
  paleta?: Record<string, string>;
  cenas: CenaRemotion[];
}

export interface RemotionStudioUrlResponse {
  studio_url: string;
  video_url?: string;
  props?: unknown;
}

export interface StatusExportCorte {
  corte_id: string;
  numero: number;
  titulo: string;
  raw_pronto: boolean;
  grade_pronta: boolean;
  overlays_prontos: boolean;
  /** Existe pelo menos uma cena salva em `cenas_remotion`. */
  cenas_geradas?: boolean;
  /** Marca manual do editor de que as cenas estao revisadas. */
  cenas_validadas?: boolean;
  video_pronto: boolean;
  thumbnail_pronta: boolean;
  metadados_completos: boolean;
  pronto_publicar: boolean;
  titulo_youtube?: string;
  descricao_youtube?: string;
  thumbnail_path?: string;
  youtube_video_id?: string;
  youtube_url_publicado?: string;
  youtube_scheduled_at?: string;
}

export interface ExportStatusResponse {
  projeto_id: string;
  cortes: StatusExportCorte[];
}

export interface MetadadoCorte {
  id: string | null;
  corte_id: string;
  is_fire?: boolean;
  titulo_youtube: string;
  descricao_youtube: string;
  tags_youtube: string[];
  opcoes_titulo: string[];
  opcoes_texto_capa: string[];
  texto_capa: string;
  link_live_com_timestamp?: string;
  canal_credito?: string;
  prompt_thumbnail: string;
  thumbnail_path: string;
  numero_serie?: number;
  cor_serie?: string;
  criado_em?: string;
}

export type MetadadoPatch = Partial<
  Pick<
    MetadadoCorte,
    | 'titulo_youtube'
    | 'descricao_youtube'
    | 'tags_youtube'
    | 'opcoes_titulo'
    | 'opcoes_texto_capa'
    | 'texto_capa'
    | 'prompt_thumbnail'
    | 'numero_serie'
    | 'cor_serie'
  >
>;

export interface PromptManualResponse {
  prompt: string;
  formato_esperado?: unknown;
}

// D-066: histórico de avaliações do par prompt+imagem de thumbnail.
export type VeredictoThumbnail = 'otimo' | 'bom' | 'regular' | 'ruim';

export interface AvaliacaoThumbnail {
  id: string;
  corte_id: string;
  prompt_snapshot: string;
  thumbnail_path_snapshot: string;
  titulo_youtube_snapshot: string;
  texto_capa_snapshot: string;
  veredito: VeredictoThumbnail;
  nota_fidelidade: number | null;
  nota_clareza: number | null;
  nota_beleza: number | null;
  nota_impacto: number | null;
  nota_honestidade: number | null;
  comentario: string;
  criado_em: string | null;
}

export interface AvaliacaoThumbnailResumo {
  total: number;
  positivos: number;
  por_veredito: Record<VeredictoThumbnail, number>;
  medias_criterios: Record<string, number | null>;
}

export interface AvaliacaoThumbnailHistorico {
  avaliacoes: AvaliacaoThumbnail[];
  resumo: AvaliacaoThumbnailResumo;
}

export interface RegistrarAvaliacaoThumbnailBody {
  veredito: VeredictoThumbnail;
  nota_fidelidade: number | null;
  nota_clareza: number | null;
  nota_beleza: number | null;
  nota_impacto: number | null;
  nota_honestidade: number | null;
  comentario: string;
}

export interface FiltroExport {
  id: string;
  nome: string;
  descricao: string;
  tem_filtro_visual: boolean;
}

export interface VersaoExport {
  filtro: string;
  nome: string;
  descricao?: string;
  e_preview: boolean;
  completo_disponivel: boolean;
  tamanho_mb?: number;
}

export interface FilaProcessamento {
  ativo: boolean;
  total: number;
  concluidos: number;
  processando: number;
  aguardando: number;
  erros: number;
  pct: number;
  detalhes?: Record<string, string>;
}

export interface FilaGlobal {
  pos_producao: {
    total: number;
    processando: number;
    aguardando: number;
    concluidos: number;
    erros: number;
    ativo: boolean;
  };
  upload_youtube: {
    total: number;
    processando: number;
    concluidos: number;
    erros: number;
    ativo: boolean;
  };
}

export interface BulkYoutubeRequest {
  corte_ids: string[];
  agendar: boolean;
  videos_por_dia: number;
  data_inicio?: string;
  hora_publicacao: string;
}

export interface BulkYoutubeResponse {
  message: string;
  agenda: Array<{ corte_id: string; scheduled_at: string | null }>;
}

export interface YoutubeLive {
  video_id: string;
  titulo: string;
  data_publicacao: string;
  data_publicacao_yyyymmdd: string;
  thumbnail_url: string;
  duracao_iso: string;
  youtube_url: string;
  ja_baixado: boolean;
}

export interface YoutubeLivesResponse {
  lives: YoutubeLive[];
  after_date: string;
  channel_id?: string;
}

export interface EnfileirarDownloadsResponse {
  message: string;
  criados: Array<{ projeto_id: string; video_id: string; youtube_url: string }>;
  ignorados: string[];
}

// ─── F-052: Ranking de lives candidatas ────────────────────────────────────

export type StatusLiveCandidata = 'pendente' | 'rejeitada' | 'promovida';

export interface RankingLive {
  id: string;
  video_id: string;
  titulo: string;
  canal_origem: string;
  youtube_url: string;
  thumbnail_url: string;
  duracao_iso: string;
  data_publicacao: string;
  views: number;
  likes: number;
  comentarios: number;
  sentimento_score: number;
  sentimento_destaques: string[];
  pontuacao_total: number;
  componentes_pontuacao: Record<string, number>;
  status: StatusLiveCandidata;
  fetched_at: string;
}

export interface RankingLivesResponse {
  lives: RankingLive[];
  atualizado_em: string;
  janela_meses?: number;
}

export interface EnfileirarCandidataResponse {
  projeto_id: string;
  video_id: string;
  pontuacao_ranking?: number;
  ja_existia: boolean;
}

export interface AnalisePromptResponse {
  prompt?: string;
  prompts?: Array<{ parte: number; total_partes: number; texto: string }>;
  formato_esperado?: unknown;
}

export interface ImportarAnaliseRequest {
  cortes: unknown[];
}

export interface AnalisarIntervaloRequest {
  inicio_hms: string;
  fim_hms: string;
}

export interface YouTubeUploadRequest {
  scheduled_at: string | null;
}

export interface YouTubeManualPublishRequest {
  youtube_url: string;
}

export interface YouTubePublishResponse {
  status: string;
  mensagem: string;
  video_id?: string;
  url?: string;
  titulo?: string;
  privacy_status?: string;
  upload_status?: string;
  scheduled_at?: string;
}

export interface CriarProjetoRequest {
  youtube_url: string;
  canal_origem?: string;
}

export interface ReiniciarFalhadosResponse {
  message: string;
  total: number;
  ids: string[];
}

export interface LimparArquivosResponse {
  message: string;
  liberado_mb: number;
  removidos: string[];
  preservados?: string[];
  pulados?: string[];
  erros?: string[];
}

export type LogLevel = 'disabled' | 'info' | 'debug';

export type OverlayCodec = 'prores_4444' | 'vp9';

// D-191: ajustes do pipeline de renderizacao, agora editaveis pela UI.
export interface RenderSettings {
  cooldown_sec: number;
  overlay_concurrency: number;
  bundle_cache_enabled: boolean;
  overlay_codec: OverlayCodec;
  overlay_max_attempts: number;
  grade_global_quality: number;
}

export interface AppSettings {
  log_level: LogLevel;
  filtro_global_padrao: string;
  // F-024: layout YouTube padrao em escopo GLOBAL (separado do
  // `Projeto.layout_youtube_padrao` que e por-projeto). JSON string;
  // "{}" significa "sem padrao global definido".
  youtube_layout_padrao_global?: string;
  // D-191: bloco de render exposto pela API (settings vivem no banco).
  render?: RenderSettings;
}
