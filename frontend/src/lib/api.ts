import type {
  AdicionarDesvioRequest,
  AnalisarIntervaloRequest,
  AnalisePromptResponse,
  AppSettings,
  ArranjoBlocos,
  AuditoriaAnaliseResponse,
  BulkYoutubeRequest,
  BulkYoutubeResponse,
  CenaRemotion,
  CenasRemotionPayload,
  Corte,
  CriarProjetoRequest,
  ExportStatusResponse,
  FilaGlobal,
  FiltroExport,
  FontePreset,
  ImportarAnaliseRequest,
  LimparArquivosResponse,
  LogLevel,
  MetadadoCorte,
  RenderSettings,
  MetadadoPatch,
  PipelineStatusResponse,
  PromptManualResponse,
  Projeto,
  ReiniciarFalhadosResponse,
  RemotionStudioUrlResponse,
  StatusBrutoResponse,
  VersaoExport,
  WaveformPeaksResponse,
  LiberarPublicacaoRequest,
  LiberarPublicacaoResponse,
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
import type { ProviderIA } from '@/lib/providerIa';
import { API_BASE, VIDEOS_BASE, wsUrl } from '@/lib/apiBase';


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

// D-160 — opt-ins da regeração do bruto. Só valem quando o corte já tem bruto
// (regeração); na 1ª geração o backend força a cadeia completa.
export interface GerarBrutoOpcoes {
  refazer_transcricao?: boolean;
  refazer_cenas?: boolean;
}

// D-286 — diarização de falantes (canal vs. reagidos). Tipos definidos aqui (e
// não em models.ts) porque models.ts está sob lock e fora do escopo.
export interface FalanteInfo {
  nome: string;
  is_canal: boolean;
}

/** Mapa {speaker_id -> info}, ex.: { "SPEAKER_00": { nome: "Pedro", is_canal: true } }. */
export type FalantesMap = Record<string, FalanteInfo>;

export interface DiarizarResponse {
  ok: boolean;
  falantes?: FalantesMap;
  canal?: string | null;
  motivo?: string;
}

export interface FalantesResponse {
  falantes: FalantesMap;
}

export const api = {
  listarProjetos: () => request<Projeto[]>('/projetos'),

  // D-532: a geometria resolvida da capa do TikTok, para o editor de layout.
  // O frontend nao recalcula: pede pronta e devolve a que o operador soltou.
  obterLayoutCapaTiktok: () =>
    request<{
      quadro: { largura: number; altura: number };
      faixa_segura: { y: number; h: number };
      componentes: string[];
      lado_minimo: number;
      padrao: Record<string, { x: number; y: number; w: number; h: number }>;
      atual: Record<string, { x: number; y: number; w: number; h: number }>;
    }>('/settings/capa-tiktok/layout'),

  obterSettings: () => request<AppSettings>('/settings'),

  atualizarSettings: (
    body:
      | LogLevel
      | {
          log_level?: LogLevel;
          filtro_global_padrao?: string;
          youtube_layout_padrao_global?: string;
          capa_tiktok_layout?: string;
          // D-450: velocidade inicial dos players de preview.
          velocidade_player_padrao?: number;
          // D-451: janela de contexto do editor (antes/depois do corte).
          contexto_antes_seg?: number;
          contexto_depois_seg?: number;
          // D-191: bloco completo de render (editável pela UI).
          render?: RenderSettings;
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

  // D-527: traz de volta o video de uma live ja limpa, preservando o resto.
  // NAO confundir com `reiniciarDownload`, que zera transcricao, titulo e
  // duracao — os cortes apontam para tempos daquela transcricao.
  rebaixarVideoProjeto: (id: string) =>
    request<{ message: string; projeto_id: string }>(`/projetos/${id}/rebaixar-video`, {
      method: 'POST',
    }),

  // Sem corpo: o default do backend preserva o bruto dos Fires com shorts pendentes.
  limparArquivosProjeto: (id: string) =>
    request<LimparArquivosResponse>(`/projetos/${id}/limpar-arquivos`, { method: 'POST' }),

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

  /** D-746: a pasta da LIVE (a do corte é `abrirPastaCorte`). */
  abrirPastaProjeto: (projetoId: string) =>
    request<{ status: string; dir_path: string }>(`/projetos/${projetoId}/abrir-pasta`, {
      method: 'POST',
      body: '{}',
    }),

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
  // D-286: `usarDiarizacao` (default true) injeta o rótulo de falante no prompt
  // quando o projeto já foi diarizado; false analisa ignorando os falantes.
  analisarViaClaude: (projetoId: string, usarDiarizacao = true, provider: 'claude' | 'gemini' = 'claude') =>
    request<{ message: string; projeto_id: string; provider: string; total_cortes?: number }>(
      `/claude/projeto/${projetoId}/analisar?usar_diarizacao=${usarDiarizacao}&provider=${provider}`,
      { method: 'POST', body: '{}' },
    ),

  // D-286: diarização de falantes (canal vs. reagidos).
  diarizarProjeto: (projetoId: string) =>
    request<DiarizarResponse>(`/diarizacao/projeto/${projetoId}/diarizar`, {
      method: 'POST',
      body: '{}',
    }),

  obterFalantes: (projetoId: string) =>
    request<FalantesResponse>(`/diarizacao/projeto/${projetoId}/falantes`),

  atualizarFalantes: (projetoId: string, falantes: FalantesMap) =>
    request<FalantesResponse>(`/diarizacao/projeto/${projetoId}/falantes`, {
      method: 'PUT',
      body: JSON.stringify({ falantes }),
    }),

  gerarTrechosClaude: (corteId: string, provider: 'claude' | 'gemini' = 'claude') =>
    request<{ message: string; corte_id: string; total_desvios: number; novos: number }>(
      `/claude/corte/${corteId}/gerar-trechos?provider=${provider}`,
      { method: 'POST', body: '{}' },
    ),

  gerarCenasClaude: (corteId: string, provider: 'claude' | 'gemini' = 'claude') =>
    request<{ message: string; corte_id: string; total_cenas: number }>(
      `/claude/corte/${corteId}/gerar-cenas?provider=${provider}`,
      { method: 'POST', body: '{}' },
    ),

  gerarMetadadosClaude: (corteId: string, provider: 'claude' | 'gemini' = 'claude') =>
    request<{ message: string; corte_id: string; ok: boolean }>(
      `/claude/corte/${corteId}/gerar-metadados?provider=${provider}`,
      { method: 'POST', body: '{}' },
    ),

  gerarPromptThumbnailClaude: (corteId: string, provider: 'claude' | 'gemini' = 'claude') =>
    request<{ message: string; corte_id: string; ok: boolean }>(
      `/claude/corte/${corteId}/gerar-prompt-thumbnail?provider=${provider}`,
      { method: 'POST', body: '{}' },
    ),

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

  /**
   * D-566: desfaz a marca de publicação de um destino.
   *
   * O espelho de `marcarPublicadoYouTube`: aquele conta que o vídeo está lá
   * fora, este conta que não está mais. Sem ele, apagar o vídeo do YouTube
   * para reprocessar deixava o corte preso — o botão de enviar some quando há
   * URL publicada e o backend responde "já publicado; upload ignorado".
   */
  liberarPublicacao: (corteId: string, body: LiberarPublicacaoRequest) =>
    request<LiberarPublicacaoResponse>(`/export/corte/${corteId}/publicacao/liberar`, {
      method: 'POST',
      body: JSON.stringify(body),
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

  filaGlobal: () => request<FilaGlobal>('/export/fila-global'),

  /** D-426: interrompe um job da fila global sem derrubar a aplicação. */
  cancelarJob: (jobId: string) =>
    request<{ job_id: string; cancelado: boolean; jobs_worker_avisados: number }>(
      '/export/fila-global/cancelar',
      { method: 'POST', body: JSON.stringify({ job_id: jobId }) },
    ),

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

  // D-575: funde este corte com o vizinho seguinte (ou com `outro_corte_id`).
  // Sobrevive o que comeca antes — ele herda bordas, trechos a remover, cenas,
  // layout e shorts do outro. Retorna o corte resultante.
  juntarCortes: (corteId: string, body: { outro_corte_id?: string } = {}) =>
    request<Corte>(`/cortes/${corteId}/juntar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // D-576: ordem de exibição dos blocos do corte. Toda operação devolve o
  // arranjo inteiro recalculado — o cliente não deduz estado, só desenha.
  obterArranjo: (corteId: string) => request<ArranjoBlocos>(`/cortes/${corteId}/arranjo`),

  dividirBloco: (corteId: string, body: { ponto_seg: number }) =>
    request<ArranjoBlocos>(`/cortes/${corteId}/arranjo/dividir`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  moverBloco: (corteId: string, body: { de_indice: number; para_indice: number }) =>
    request<ArranjoBlocos>(`/cortes/${corteId}/arranjo/mover`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  fundirBloco: (corteId: string, body: { indice: number }) =>
    request<ArranjoBlocos>(`/cortes/${corteId}/arranjo/fundir`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  restaurarArranjo: (corteId: string) =>
    request<ArranjoBlocos>(`/cortes/${corteId}/arranjo/restaurar`, { method: 'POST' }),

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

  aplicarMolduraThumbnail: (corteId: string) =>
    request<{ message: string; moldura: string }>(
      `/metadados/corte/${corteId}/aplicar-moldura`,
      { method: 'POST', body: '{}' },
    ),

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

  // D-304: dispara em lote a mesma geração de trechos (trechos-expert/Claude)
  // para TODOS os cortes do projeto, um a um, em background. Fire-and-forget
  // — o backend não expõe progresso desta operação.
  analisarDesviosTodos: (projetoId: string, provider: ProviderIA = 'claude') =>
    request<{ message: string }>(`/cortes/projeto/${projetoId}/analisar-desvios-todos?provider=${provider}`, {
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

export { VIDEOS_BASE };

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
  return wsUrl(`/projetos/${projetoId}/ws`);
}
