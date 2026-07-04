import type {
  AdicionarDesvioRequest,
  AnalisarIntervaloRequest,
  AnalisePromptResponse,
  AppSettings,
  AuditoriaAnaliseResponse,
  AvaliacaoThumbnail,
  AvaliacaoThumbnailHistorico,
  RegistrarAvaliacaoThumbnailBody,
  BulkYoutubeRequest,
  BulkYoutubeResponse,
  CenaRemotion,
  CenasRemotionPayload,
  Corte,
  CriarProjetoRequest,
  EnfileirarCandidataResponse,
  EnfileirarDownloadsResponse,
  ExportStatusResponse,
  FilaGlobal,
  FilaProcessamento,
  FiltroExport,
  FontePreset,
  ImportarAnaliseRequest,
  LimparArquivosResponse,
  LogLevel,
  MetadadoCorte,
  MetadadoPatch,
  PipelineStatusResponse,
  PromptManualResponse,
  Projeto,
  ReiniciarFalhadosResponse,
  RemotionStudioUrlResponse,
  StatusBrutoResponse,
  VersaoExport,
  WaveformPeaksResponse,
  RankingLivesResponse,
  YoutubeLivesResponse,
  YouTubeManualPublishRequest,
  YouTubePublishResponse,
  YouTubeUploadRequest,
} from '@/types/models';
import type {
  AtualizarLayoutPresetRequest,
  CriarLayoutPresetRequest,
  LayoutPreset,
  LayoutPresetTipo,
} from '@/types/presets';

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// D-070: análise de padrões dos melhores prompts de thumbnail. Tipos definidos
// aqui (e não em models.ts) porque models.ts está sob lock e fora do escopo.
export interface PadroaoEixoOcorrencia {
  valor: string;
  contagem: number;
}

export interface PadroesCompilados {
  total_melhores: number;
  com_tags: number;
  eixos: Record<string, PadroaoEixoOcorrencia[]>;
}

export interface PadraoIdentificado {
  eixo: string;
  padrao: string;
  evidencia: string;
  forca: 'alta' | 'media' | 'baixa' | string;
}

export interface AnalisePadroesAgente {
  resumo: string;
  padroes: PadraoIdentificado[];
  proposta_ajuste_skill: string;
}

export interface PadroesThumbnailResponse {
  status: 'ok' | 'dados_insuficientes';
  total_avaliacoes: number;
  total_melhores: number;
  com_tags?: number;
  minimo?: number;
  padroes: PadroesCompilados | null;
  analise: AnalisePadroesAgente | null;
}

// D-160 — opt-ins da regeração do bruto. Só valem quando o corte já tem bruto
// (regeração); na 1ª geração o backend força a cadeia completa.
export interface GerarBrutoOpcoes {
  refazer_transcricao?: boolean;
  refazer_cenas?: boolean;
}

export const api = {
  listarProjetos: () => request<Projeto[]>('/projetos'),

  obterSettings: () => request<AppSettings>('/settings'),

  atualizarSettings: (
    body:
      | LogLevel
      | {
          log_level?: LogLevel;
          filtro_global_padrao?: string;
          youtube_layout_padrao_global?: string;
        },
  ) =>
    request<AppSettings>('/settings', {
      method: 'PUT',
      // Compat: callers antigos passam apenas LogLevel (string). Novos
      // passam objeto para atualizar campos especificos.
      body: JSON.stringify(typeof body === 'string' ? { log_level: body } : body),
    }),

  criarProjeto: (body: CriarProjetoRequest) =>
    request<Projeto>('/projetos', { method: 'POST', body: JSON.stringify(body) }),

  removerProjeto: (id: string) =>
    request<{ message: string }>(`/projetos/${id}`, { method: 'DELETE' }),

  limparArquivosProjeto: (id: string) =>
    request<LimparArquivosResponse>(`/projetos/${id}/limpar-arquivos`, {
      method: 'POST',
      body: '{}',
    }),

  reiniciarDownload: (id: string) =>
    request<{ message: string }>(`/projetos/${id}/reiniciar-download`, {
      method: 'POST',
      body: '{}',
    }),

  reiniciarDownloadsFalhados: () =>
    request<ReiniciarFalhadosResponse>('/projetos/reiniciar-downloads-falhados', {
      method: 'POST',
      body: '{}',
    }),

  obterProjeto: (id: string) => request<Projeto>(`/projetos/${id}`),

  /** I-034: audit trail da última análise IA (justificativa por corte + descartados). */
  obterAuditoriaAnalise: (id: string) =>
    request<AuditoriaAnaliseResponse>(`/projetos/${id}/auditoria-analise`),

  /** PATCH config visual de render do projeto. */
  atualizarRenderConfig: (
    id: string,
    body: {
      sombra_nivel_padrao?: 'nenhuma' | 'leve' | 'media' | 'forte';
      layout_card_padrao?: 'horizontal' | 'vertical';
      layout_youtube_padrao?: string;
      global_update?: boolean;
      fonte_preset?: FontePreset;
    },
  ) =>
    request<Projeto>(`/projetos/${id}/render-config`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // ─── Export status (cortes com flags raw/video/thumb/meta) ─────────
  exportStatus: (projetoId: string) =>
    request<ExportStatusResponse>(`/export/projeto/${projetoId}/status`),

  abrirPastaCorte: (corteId: string) =>
    request<{ status: string; dir_path: string }>(`/cortes/${corteId}/abrir-pasta`, {
      method: 'POST',
      body: '{}',
    }),

  // ─── Análise IA ────────────────────────────────────────────────────
  obterPromptAnalise: (projetoId: string) =>
    request<AnalisePromptResponse>(`/projetos/${projetoId}/analise/prompt`),

  obterPromptAnaliseIntervalo: (
    projetoId: string,
    params: AnalisarIntervaloRequest & { blocos: number },
  ) => {
    const query = new URLSearchParams({
      inicio_hms: params.inicio_hms,
      fim_hms: params.fim_hms,
      blocos: String(params.blocos),
    });
    return request<AnalisePromptResponse>(
      `/projetos/${projetoId}/analise-intervalo/prompt?${query.toString()}`,
    );
  },

  importarAnalise: (projetoId: string, body: ImportarAnaliseRequest) =>
    request<{ message: string; total_cortes: number }>(`/projetos/${projetoId}/analise/importar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reanalisarProjeto: (projetoId: string) =>
    request<{ message: string; cortes_removidos: number }>(`/projetos/${projetoId}/reanalisar`, {
      method: 'POST',
      body: '{}',
    }),

  // Re-baixa a transcrição via json3 (sem roll-up/duplicação do VTT) e
  // re-sincroniza todos os cortes (transcricao_final).
  refazerTranscricao: (projetoId: string) =>
    request<{ message: string; total_cortes_sincronizados: number }>(
      `/projetos/${projetoId}/refazer-transcricao`,
      { method: 'POST', body: '{}' },
    ),

  // Provider Claude (geração alternativa via `claude -p`) — F-038
  analisarViaClaude: (projetoId: string) =>
    request<{ message: string; projeto_id: string; provider: string; total_cortes?: number }>(
      `/claude/projeto/${projetoId}/analisar`,
      { method: 'POST', body: '{}' },
    ),

  gerarTrechosClaude: (corteId: string) =>
    request<{ message: string; corte_id: string; total_desvios: number; novos: number }>(
      `/claude/corte/${corteId}/gerar-trechos`,
      { method: 'POST', body: '{}' },
    ),

  gerarCenasClaude: (corteId: string) =>
    request<{ message: string; corte_id: string; total_cenas: number }>(
      `/claude/corte/${corteId}/gerar-cenas`,
      { method: 'POST', body: '{}' },
    ),

  gerarMetadadosClaude: (corteId: string) =>
    request<{ message: string; corte_id: string; ok: boolean }>(
      `/claude/corte/${corteId}/gerar-metadados`,
      { method: 'POST', body: '{}' },
    ),

  gerarPromptThumbnailClaude: (corteId: string) =>
    request<{ message: string; corte_id: string; ok: boolean }>(
      `/claude/corte/${corteId}/gerar-prompt-thumbnail`,
      { method: 'POST', body: '{}' },
    ),

  // D-066: histórico de avaliações do par prompt+imagem de thumbnail.
  registrarAvaliacaoThumbnail: (corteId: string, body: RegistrarAvaliacaoThumbnailBody) =>
    request<{ message: string; avaliacao: AvaliacaoThumbnail }>(
      `/avaliacoes-thumbnail/corte/${corteId}`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listarAvaliacoesThumbnail: (corteId: string) =>
    request<AvaliacaoThumbnailHistorico>(`/avaliacoes-thumbnail/corte/${corteId}`),

  // D-070: dispara a análise de padrões dos melhores prompts avaliados.
  analisarPadroesThumbnail: () =>
    request<PadroesThumbnailResponse>(`/avaliacoes-thumbnail/padroes`, {
      method: 'POST',
      body: '{}',
    }),

  analisarIntervalo: (projetoId: string, body: AnalisarIntervaloRequest) =>
    request<{ message: string; novos_cortes: number; primeiro_numero: number }>(
      `/projetos/${projetoId}/analisar-intervalo`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // ─── Upload YouTube individual (usado em loop p/ massa com +15min) ─
  uploadYouTube: (corteId: string, body: YouTubeUploadRequest) =>
    request<YouTubePublishResponse>(`/export/corte/${corteId}/youtube`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  marcarPublicadoYouTube: (corteId: string, body: YouTubeManualPublishRequest) =>
    request<YouTubePublishResponse>(`/export/corte/${corteId}/youtube/marcar-publicado`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  processarClip: (corteId: string, filtro = 'nenhum') =>
    request<{ message: string; corte_id: string }>(
      `/export/corte/${corteId}/processar?filtro=${encodeURIComponent(filtro)}`,
      { method: 'POST', body: '{}' },
    ),

  aplicarFaststart: (corteId: string) =>
    request<{ status: string; mensagem: string }>(`/export/corte/${corteId}/faststart`, {
      method: 'POST',
      body: '{}',
    }),

  listarFiltros: () => request<{ filtros: FiltroExport[] }>('/export/filtros'),

  listarVersoes: (corteId: string) =>
    request<{ corte_id: string; versoes: VersaoExport[] }>(`/export/corte/${corteId}/versoes`),

  processarMultiversion: (
    corteId: string,
    preview = true,
    previewSegundos = 10,
    filtros: string[] | null = null,
  ) =>
    request<{ message: string; filtros: string[] }>(
      `/export/corte/${corteId}/processar-multiversion?preview=${preview}&preview_segundos=${previewSegundos}`,
      { method: 'POST', body: JSON.stringify(filtros ? { filtros } : {}) },
    ),

  // I-023: filtro padrão de render vive só em Ajustes (PUT /settings).
  // O antigo PATCH /export/projeto/{id}/filtro-padrao foi removido — não
  // existia "filtro por projeto" coerente com a fonte única definida em
  // AppSettings.filtro_global_padrao.

  bulkProcessar: (projetoId: string, corteIds: string[], filtro: string) =>
    request<{ message: string }>(`/export/projeto/${projetoId}/bulk-processar`, {
      method: 'POST',
      body: JSON.stringify({ corte_ids: corteIds, filtro }),
    }),

  filaProcessamento: (projetoId: string) =>
    request<FilaProcessamento>(`/export/projeto/${projetoId}/fila-processamento`),

  filaGlobal: () => request<FilaGlobal>('/export/fila-global'),

  bulkYoutube: (projetoId: string, body: BulkYoutubeRequest) =>
    request<BulkYoutubeResponse>(`/export/projeto/${projetoId}/bulk-youtube`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ─── Cortes (editor) ───────────────────────────────────────────────
  listarCortes: (projetoId: string) => request<Corte[]>(`/cortes/projeto/${projetoId}`),

  // F-056: cria um corte manualmente a partir de inicio/fim (HMS).
  // Backend sincroniza a transcricao; a analise de desvios (Gemini) e
  // disparada em seguida pelo frontend via `analisarDesviosIa`.
  criarCorteManual: (
    projetoId: string,
    body: { inicio_hms: string; fim_hms: string; titulo_proposto?: string | null },
  ) =>
    request<Corte>(`/cortes/projeto/${projetoId}/manual`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // F-057: renumera os cortes do projeto na ordem informada. Espera a
  // lista completa de ids do projeto.
  reordenarCortes: (projetoId: string, cortesIds: string[]) =>
    request<Corte[]>(`/cortes/projeto/${projetoId}/reordenar`, {
      method: 'POST',
      body: JSON.stringify({ cortes_ids: cortesIds }),
    }),

  // F-061: divide um corte em dois no ponto (ponteiro do player). O backend
  // encolhe o corte original e cria um novo a partir do ponto, herdando os
  // trechos a remover da metade direita. Retorna [original_atualizado, novo].
  dividirCorte: (corteId: string, body: { ponto_seg?: number; ponto_hms?: string }) =>
    request<Corte[]>(`/cortes/${corteId}/dividir`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  obterCorte: (corteId: string) => request<Corte>(`/cortes/${corteId}`),

  atualizarCorte: (corteId: string, patch: Partial<Corte>) =>
    request<Corte>(`/cortes/${corteId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  aprovarCorte: (corteId: string) =>
    request<{ message: string }>(`/cortes/${corteId}/aprovar`, {
      method: 'POST',
      body: '{}',
    }),

  // F-054: dispara detecção de mudanças de cena no bruto do corte.
  detectarSegmentos: (corteId: string) =>
    request<{ status: string; corte_id: string }>(`/cortes/${corteId}/detectar-segmentos`, {
      method: 'POST',
      body: '{}',
    }),

  // F-054: rejeita / aceita um segmento sugerido. Aceitar materializa região.
  decidirSegmentoDetectado: (
    corteId: string,
    indice: number,
    decisao: 'rejeitar' | 'full' | 'compartilhada',
  ) =>
    request<Corte>(`/cortes/${corteId}/segmentos-detectados/${indice}`, {
      method: 'PATCH',
      body: JSON.stringify({ decisao }),
    }),

  deletarCorte: (corteId: string) =>
    request<{ message: string }>(`/cortes/${corteId}`, {
      method: 'DELETE',
    }),

  toggleFireMeta: (corteId: string) =>
    request<{ is_fire: boolean; titulo_youtube: string }>(
      `/metadados/corte/${corteId}/toggle-fire`,
      { method: 'POST', body: '{}' },
    ),

  obterMetadado: (corteId: string) => request<MetadadoCorte>(`/metadados/corte/${corteId}`),

  gerarMetadados: (corteId: string) =>
    request<{ message: string; corte_id: string }>(`/metadados/corte/${corteId}/gerar`, {
      method: 'POST',
      body: '{}',
    }),

  atualizarMetadado: (corteId: string, patch: MetadadoPatch) =>
    request<{ message: string }>(`/metadados/corte/${corteId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  gerarPromptThumbnail: (corteId: string) =>
    request<{ message: string; corte_id: string }>(`/metadados/corte/${corteId}/gerar-prompt`, {
      method: 'POST',
      body: '{}',
    }),

  gerarThumbnail: (corteId: string) =>
    request<{ message: string; corte_id: string }>(`/metadados/corte/${corteId}/gerar-thumbnail`, {
      method: 'POST',
      body: '{}',
    }),

  uploadThumbnail: (corteId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ message: string; thumbnail_path: string }>(
      `/metadados/corte/${corteId}/thumbnail-manual`,
      { method: 'POST', body: formData },
    );
  },

  comprimirThumbnail: (corteId: string) =>
    request<{ message: string }>(`/metadados/corte/${corteId}/comprimir-thumbnail`, {
      method: 'POST',
      body: '{}',
    }),

  removerThumbnail: (corteId: string) =>
    request<{ message: string; arquivo_removido: boolean }>(
      `/metadados/corte/${corteId}/thumbnail`,
      { method: 'DELETE' },
    ),

  obterPromptMeta: (corteId: string) =>
    request<PromptManualResponse>(`/metadados/corte/${corteId}/meta/prompt`),

  importarMeta: (corteId: string, payload: unknown) =>
    request<{ message: string }>(`/metadados/corte/${corteId}/meta/importar`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  obterPromptThumbnail: (corteId: string) =>
    request<PromptManualResponse>(`/metadados/corte/${corteId}/prompt-thumbnail/prompt`),

  obterPromptThumbnailAgente: (corteId: string) =>
    request<PromptManualResponse>(`/metadados/corte/${corteId}/thumbnail-agent/prompt`),

  obterPromptThumbnailAgenteLivre: (corteId: string) =>
    request<PromptManualResponse>(`/metadados/corte/${corteId}/thumbnail-agent-livre/prompt`),

  importarPromptThumbnail: (corteId: string, payload: unknown) =>
    request<{ message: string }>(`/metadados/corte/${corteId}/prompt-thumbnail/importar`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Desvios / trechos a remover
  analisarDesviosCorte: (corteId: string, limparAnteriores: boolean) =>
    request<Corte>(`/cortes/${corteId}/analisar-desvios?limpar_anteriores=${limparAnteriores}`, {
      method: 'POST',
      body: '{}',
    }),

  // F-056: dispara analise editorial de desvios via Gemini (repeticoes,
  // desvios de tema, bate-papo). Usado apos criar um corte manual para
  // sugerir trechos a remover automaticamente.
  analisarDesviosIa: (corteId: string) =>
    request<Corte>(`/cortes/${corteId}/analisar-desvios-ia`, {
      method: 'POST',
      body: '{}',
    }),

  // Prompt p/ rodar a análise de trechos numa IA externa (Manual)
  obterPromptDesvios: (corteId: string) =>
    request<{
      prompts: { parte: number; total_partes: number; texto: string }[];
      formato_esperado?: unknown;
    }>(`/cortes/${corteId}/desvios/prompt`),

  // Importa o JSON retornado pela IA externa (Manual) — body: { trechos: [...] }
  importarDesvios: (corteId: string, trechos: unknown[]) =>
    request<Corte>(`/cortes/${corteId}/desvios/importar`, {
      method: 'POST',
      body: JSON.stringify({ trechos }),
    }),

  adicionarDesvio: (corteId: string, body: AdicionarDesvioRequest) =>
    request<Corte>(`/cortes/${corteId}/adicionar-desvio`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removerDesvio: (corteId: string, desvioIndex: number) =>
    request<Corte>(`/cortes/${corteId}/remover-desvio`, {
      method: 'POST',
      body: JSON.stringify({ desvio_index: desvioIndex }),
    }),

  criarCorteDoDesvio: (corteId: string, desvioIndex: number, titulo: string) =>
    request<Corte>(`/cortes/${corteId}/corte-do-desvio`, {
      method: 'POST',
      body: JSON.stringify({ desvio_index: desvioIndex, titulo }),
    }),

  sincronizarTranscricao: (corteId: string) =>
    request<Corte>(`/cortes/${corteId}/sincronizar-transcricao`, {
      method: 'POST',
      body: '{}',
    }),

  sincronizarPosProducao: (corteId: string) =>
    request<{ message: string }>(`/cortes/${corteId}/sincronizar-pos-producao`, {
      method: 'POST',
      body: '{}',
    }),

  // Geração de vídeo bruto (cortar com ffmpeg, removendo TODOS os desvios).
  // Dispara assíncrono; acompanhe progresso por statusClipBruto.
  // D-160 — na regeração (corte já com bruto) o default é só o bruto; passe
  // os opt-ins para também refazer transcrição/cenas. Na 1ª geração o backend
  // força a cadeia completa e ignora estes flags.
  cortarClipBruto: (corteId: string, opts?: GerarBrutoOpcoes) =>
    request<{ message: string; corte_id: string }>(`/cortes/${corteId}/gerar-bruto`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),

  statusClipBruto: (corteId: string) =>
    request<StatusBrutoResponse>(`/export/corte/${corteId}/cortar/status`),

  // F-038 — passos do gerar/regerar bruto (para o dropdown de acompanhamento).
  brutoProgress: (corteId: string) =>
    request<{ passos: { chave: string; label: string; status: string }[] }>(
      `/cortes/${corteId}/bruto-progress`,
    ),

  obterWaveformPeaks: (corteId: string, refresh = false) =>
    request<WaveformPeaksResponse>(
      `/cortes/${corteId}/waveform-peaks${refresh ? '?refresh=true' : ''}`,
    ),

  renderizarRemotion: (
    corteId: string,
    options: {
      startFrom?: 'auto' | 'grade' | 'overlays' | 'overlays_continuar' | 'render_final';
      // D-064: render granular — para após esta fase (parcial, não finaliza o
      // corte). Omitido = roda até o render final.
      pararEm?: 'grade' | 'overlays' | 'render_final';
      // D-064: quando informado explicitamente, controla o reaproveitamento de
      // overlays (continuar vs. refazer do zero). Quando ausente, é derivado do
      // `startFrom` (comportamento legado).
      continuar?: boolean;
      filtro?: string;
    } = {},
  ) => {
    const startFromUi = options.startFrom ?? 'auto';
    const isContinuarFase2 = startFromUi === 'overlays_continuar';
    // I-023: NUNCA enviar fallback hardcoded de filtro. Quando o caller não
    // especifica um filtro de teste, o backend resolve `filtro=null` para
    // `AppSettings.filtro_global_padrao` (fonte única configurada em Ajustes).
    // O bug anterior ("renderiza sempre cinematic_iii completo") era exatamente
    // este fallback aqui passando `'cinematic_iii'` por cima do global.
    const payload: {
      filtro?: string;
      continuar: boolean;
      start_from: string;
      parar_em?: string;
    } = {
      continuar: options.continuar ?? (startFromUi === 'auto' || isContinuarFase2),
      start_from: isContinuarFase2 ? 'overlays' : startFromUi,
    };
    if (options.pararEm) payload.parar_em = options.pararEm;
    if (options.filtro) payload.filtro = options.filtro;
    return request<{ message: string }>(`/cortes/${corteId}/renderizar-pipeline`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  obterPipelineStatus: (corteId: string) =>
    request<PipelineStatusResponse>(`/cortes/${corteId}/pipeline-status`),

  obterRemotionStudioUrl: (corteId: string) =>
    request<RemotionStudioUrlResponse>(`/cortes/${corteId}/remotion-studio-url`),

  obterCaminhoPasta: (corteId: string) =>
    request<{ dir_path: string }>(`/cortes/${corteId}/caminho-pasta`),

  // ─── Cenas Remotion ────────────────────────────────────────────────
  gerarCenasRemotion: (corteId: string) =>
    request<CenasRemotionPayload | { cenas: CenaRemotion[] }>(
      `/cortes/${corteId}/gerar-cenas-remotion`,
      { method: 'POST', body: '{}' },
    ),

  importarCenasRemotion: (corteId: string, payload: CenasRemotionPayload) =>
    request<{ message: string }>(`/cortes/${corteId}/cenas-remotion/importar`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  validarCenasRemotion: (corteId: string, validado = true) =>
    request<Corte>(`/cortes/${corteId}/cenas-remotion/validar`, {
      method: 'POST',
      body: JSON.stringify({ validado }),
    }),

  obterPromptCenasRemotion: (corteId: string) =>
    request<{
      prompt: string;
      prompts: { parte: number; total_partes: number; texto: string }[];
      formato_esperado?: unknown;
    }>(`/cortes/${corteId}/cenas-remotion/prompt`),

  listarLivesCanal: (afterDate = '', maxResults = 25) => {
    const params = new URLSearchParams({ max_results: String(maxResults) });
    if (afterDate) params.set('after_date', afterDate);
    return request<YoutubeLivesResponse>(`/youtube/lives?${params.toString()}`);
  },

  enfileirarDownloads: (videoIds: string[], canalOrigem = import.meta.env.VITE_CANAL_HANDLE ?? '@seucanal') =>
    request<EnfileirarDownloadsResponse>('/youtube/enfileirar', {
      method: 'POST',
      body: JSON.stringify({ video_ids: videoIds, canal_origem: canalOrigem }),
    }),

  // ─── F-052: Ranking de lives candidatas ───────────────────────────
  listarRankingLives: (forcarRefresh = false) =>
    request<RankingLivesResponse>(`/ranking-lives${forcarRefresh ? '?forcar_refresh=true' : ''}`),

  refreshRankingLives: () =>
    request<RankingLivesResponse>('/ranking-lives/refresh', { method: 'POST' }),

  rejeitarCandidata: (videoId: string) =>
    request<{ video_id: string; status: string }>(`/ranking-lives/${videoId}/rejeitar`, {
      method: 'POST',
    }),

  enfileirarCandidata: (videoId: string) =>
    request<EnfileirarCandidataResponse>(`/ranking-lives/${videoId}/enfileirar`, {
      method: 'POST',
    }),

  // ─── Presets de layout YouTube (F-048) ─────────────────────────────
  listarLayoutPresets: (tipo?: LayoutPresetTipo) => {
    const query = tipo ? `?tipo=${encodeURIComponent(tipo)}` : '';
    return request<LayoutPreset[]>(`/presets/layout${query}`);
  },

  criarLayoutPreset: (body: CriarLayoutPresetRequest) =>
    request<LayoutPreset>('/presets/layout', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  atualizarLayoutPreset: (id: string, body: AtualizarLayoutPresetRequest) =>
    request<LayoutPreset>(`/presets/layout/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deletarLayoutPreset: (id: string) => request<void>(`/presets/layout/${id}`, { method: 'DELETE' }),
};

export const VIDEOS_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api'
).replace(/\/api$/, '/videos');

const CAMINHO_ABSOLUTO_RE = /^[a-zA-Z]:\//;

/** Resolve URL absoluta a partir de thumbnail_path (relativo ou absoluto). */
export function resolveThumbUrl(projetoId: string, thumbPath?: string | null): string | null {
  if (!thumbPath) return null;
  if (/^https?:\/\//i.test(thumbPath)) return thumbPath;
  // backend serve estático em /videos/{projetoId}/...
  let clean = thumbPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');

  // path absoluto (formato antigo ou novo pós-split) contendo o diretório do
  // projeto no meio do caminho: extrai só o sub-caminho relativo a ele.
  const marker = `/${projetoId}/`;
  const markerIndex = clean.indexOf(marker);
  if (markerIndex !== -1) {
    clean = clean.slice(markerIndex + marker.length);
  } else if (clean.startsWith(`${projetoId}/`)) {
    clean = clean.slice(projetoId.length + 1);
  }

  // fallback de segurança: nunca deixar um prefixo absoluto (drive/usuário)
  // vazar na URL final — se o id não foi localizado, ancora em 'thumbnails/'.
  if (CAMINHO_ABSOLUTO_RE.test(clean)) {
    const thumbIndex = clean.toLowerCase().indexOf('thumbnails/');
    clean = thumbIndex !== -1 ? clean.slice(thumbIndex) : (clean.split('/').pop() ?? clean);
  }

  return `${VIDEOS_BASE}/${projetoId}/${clean}`;
}

export function finalVideoUrl(projetoId: string, corteId: string): string {
  return `${VIDEOS_BASE}/${projetoId}/cortes/${corteId}/upload_ready/video.mp4`;
}

export function gradedVideoUrl(projetoId: string, corteId: string): string {
  return `${VIDEOS_BASE}/${projetoId}/cortes/${corteId}/graded/clip_graded.mp4`;
}

export function versaoVideoUrl(
  projetoId: string,
  corteId: string,
  filtro: string,
  preview: boolean,
): string {
  const arquivo = preview ? 'preview.mp4' : 'video.mp4';
  return `${VIDEOS_BASE}/${projetoId}/cortes/${corteId}/versoes/${filtro}/${arquivo}`;
}

export function rawVideoRedirectUrl(corteId: string): string {
  return `${API_BASE}/cortes/${corteId}/video-bruto`;
}

/**
 * Variante do `rawVideoRedirectUrl` com cache-buster.  Necessária porque o
 * navegador segura o video file em memória/disco mesmo após hard-refresh
 * em alguns casos (HTML5 video element + cache de redirect).  Passe um
 * `bustKey` que mude quando você quer forçar reload (timestamp da última
 * geração, ex.: Date.now() após status `pronto`).
 */
export function rawVideoBustedUrl(corteId: string, bustKey: number | string): string {
  return `${rawVideoRedirectUrl(corteId)}?v=${bustKey}`;
}

export function audioProxyUrl(corteId: string, refresh = false): string {
  const params = refresh ? '?refresh=true' : '';
  return `${API_BASE}/cortes/${corteId}/audio-proxy${params}`;
}

export function waveformPeaksUrl(corteId: string, refresh = false): string {
  const params = refresh ? '?refresh=true' : '';
  return `${API_BASE}/cortes/${corteId}/waveform-peaks${params}`;
}

/**
 * Busca os peaks de waveform de uma URL ja montada (via `waveformPeaksUrl`).
 * Helper proprio — e nao o `request` generico — porque os callers (timeline
 * da Bruta e do Pos) passam a URL pronta como prop/param e tratam o erro com
 * fallback proprio (carregar audio sem peaks). Centraliza o padrao cru de
 * fetch+ok-check+json para os componentes ficarem burros.
 */
export async function fetchWaveformPeaks(url: string): Promise<WaveformPeaksResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`waveform-peaks ${res.status}`);
  return (await res.json()) as WaveformPeaksResponse;
}

export function progressoWsUrl(projetoId: string): string {
  return `${API_BASE.replace(/^http(s?):/, 'ws$1:')}/projetos/${projetoId}/ws`;
}
