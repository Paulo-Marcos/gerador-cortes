import type { Schema } from '@/shared/api';
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

export type StatusCorte = 'proposto' | 'aprovado' | 'rejeitado' | 'processado';

export type FontePreset = 'atual' | 'moderna' | 'cientifica' | 'minimalista' | 'tecnica';

/** O projeto (a live) — o tipo do contrato (D-722), apelido aqui porque as
 *  telas o importam deste arquivo. */
export type Projeto = Schema<'ProjetoResponse'>;

// F-054: status de um segmento detectado automaticamente.
export type StatusSegmentoDetectado =
  | 'sugerido'
  | 'aceito_full'
  | 'aceito_compartilhada'
  | 'rejeitado';

/**
 * D-576 — um bloco na fila de exibição do corte.
 *
 * `inicio_seg`/`fim_seg` são tempo de LIVE (de onde o material vem);
 * `posicao` é onde ele toca. As duas coisas deixam de coincidir assim que o
 * editor reordena — é justamente essa separação que a funcionalidade existe
 * para permitir.
 */
export interface BlocoArranjo {
  posicao: number;
  inicio_seg: number;
  fim_seg: number;
  duracao_seg: number;
  /** Duração já descontados os desvios DESTE bloco — a que aparece no vídeo. */
  duracao_liquida_seg: number;
}

export interface ArranjoBlocos {
  corte_id: string;
  inicio_seg: number;
  fim_seg: number;
  blocos: BlocoArranjo[];
  /** True quando a ordem é a da live — inclusive fatiado e não movido. */
  cronologico: boolean;
  /** A ordem mudou e o bruto já gerado ficou velho. Aviso, não ação. */
  bruto_desatualizado: boolean;
}

export interface SegmentoDetectado {
  inicio: number;
  fim: number;
  score: number;
  status: StatusSegmentoDetectado;
}

export type DecisaoSegmentoDetectado = 'rejeitar' | 'full' | 'compartilhada';

export type DesvioOrigem = 'claude' | 'manual' | 'gemini' | 'n8n' | 'tecnico';

/** D-422: motivo editorial da remoção — eixo independente de `origem` (quem
 *  marcou). Vocabulário fechado, normalizado no backend por
 *  `domain/desvio_categoria.py`. */
export type DesvioCategoria =
  | 'repeticao'
  | 'disfluencia'
  | 'tangente'
  | 'chat'
  | 'enrolacao'
  | 'imprecisao'
  | 'tom'
  | 'silencio'
  | 'outro';

export interface Desvio {
  inicio_hms: string;
  fim_hms: string;
  motivo: string;
  /** Procedência editorial do desvio. Opcional p/ retrocompatibilidade
   *  com desvios persistidos antes do I-020. Aberta no contrato: além das de
   *  `DesvioOrigem` há `juncao` (D-575) e o que vier de importação. */
  origem?: string;
  /** Motivo da remoção. Opcional p/ retrocompatibilidade com desvios
   *  persistidos antes do D-422 (o badge infere pelo `motivo`). */
  categoria?: DesvioCategoria;
}

export interface TranscricaoLinha {
  start: number;
  end: number;
  texto: string;
  // D-286/D-360: rótulo de falante da diarização (SPEAKER_00/01…), resolvido
  // para nome/canal via `falantes_map` do projeto. Ausente = sem diarização.
  speaker?: string;
}

// D-314: ranking relativo da proposta v2 (D-302). Componentes e total podem
// faltar em análises parciais — todos opcionais.
export interface CorteScore {
  hook?: number;
  flow?: number;
  value?: number;
  total?: number;
}

/** O corte — o tipo do contrato (D-722), apelido aqui porque as telas o
 *  importam deste arquivo. As listas internas (trechos, transcrição, segmentos,
 *  arranjo, cenas, layout) vêm tipadas do CorteResponse e trazem também as
 *  chaves que o schema não declara. `is_leitura` é 0/1, como o banco guarda. */
export type Corte = Schema<'CorteResponse'>;

/** Status da geração do bruto de um corte — o tipo do contrato (D-722). */
export type StatusBrutoResponse = Schema<'StatusCorteBrutoResponse'>;

/** As fases do render com artefato aproveitável e o progresso — o tipo do
 *  contrato (D-722). */
export type PipelineStatusResponse = Schema<'SituacaoDoPipelineResponse'>;

export type ProgressoUpdate =
  | { status: 'baixando'; progresso: number }
  | { status: 'transcrevendo'; progresso?: number }
  | { status: 'pronto'; progresso: number }
  | { status: 'erro'; mensagem: string }
  | { status: 'sem_progresso'; mensagem: string };

/** Os picos da waveform do editor — o tipo do contrato (D-722). */
export type WaveformPeaksResponse = Schema<'PicosDaOndaResponse'>;

export interface AdicionarDesvioRequest {
  inicio_hms: string;
  fim_hms: string;
  motivo: string;
}

// D-725: a cena tem UMA definição — o schema zod do renderer, que valida o que
// o worker renderiza. A prévia desenha com as mesmas composições, então o tipo
// que a tela manipula é o mesmo que o render aceita.
export type { CenaRemotion } from '@video-renderer/public-api';
import type { CenaRemotion } from '@video-renderer/public-api';
export type CenaTipo = CenaRemotion['tipo'];

// `type`, e não `interface`: o PATCH do corte recebe o roteiro como objeto
// livre (Record<string, unknown>), e só um `type` cabe nele.
export type CenasRemotionPayload = {
  formato?: string;
  paleta?: Record<string, string>;
  cenas: CenaRemotion[];
};

/** O status de exportação de um corte — o tipo do contrato (D-722). Mora aqui
 *  como apelido porque 28 telas o importam deste arquivo. */
export type StatusExportCorte = Schema<'StatusExportCorte'>;

/** O metadado do corte — o tipo do contrato (D-722), apelido aqui porque as
 *  telas o importam deste arquivo. Sem metadado ainda, `id` vem nulo. */
export type MetadadoCorte = Schema<'MetadadoDoCorteResponse'>;

export type DestinoPublicacao = 'youtube' | 'tiktok';

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

/** Os ajustes do app (D-191) — o tipo do contrato (D-722), apelido aqui porque
 *  várias telas o importam deste arquivo. */
export type AppSettings = Schema<'AppSettingsResponse'>;
