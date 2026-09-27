/**
 * O layout do palco do YouTube (F-048 / F-060): só a forma dos dados.
 *
 * As regras — defaults, cascata, normalização — ficam em
 * `shared/palco/youtubeLayout`. A forma mora aqui para que `types/presets` a
 * descreva sem depender de código de camada nenhuma (D-724).
 */

export type YoutubeLayoutMode = 'full' | 'compartilhada';
export type YoutubeSharedScreenCount = 1 | 2;

/** Fundos editoriais selecionáveis para o layout compartilhado (handoff Design). */
export type YoutubeBackgroundId =
  | 'hud-forte'
  | 'topo-estrutural'
  | 'hud-topo'
  | 'architectural-hud'
  | 'topographic'
  | 'cosmograph';

export interface YoutubeLayoutRegion {
  inicio: number;
  fim: number;
  modo: YoutubeLayoutMode;
  /**
   * F-048: override opcional do `compartilhada` para este segmento. Parcial —
   * campos ausentes herdam do `compartilhada` do corte. Quando ausente ou
   * vazio, a regiao usa integralmente o config do corte.
   */
  compartilhada?: Partial<YoutubeSharedConfig>;
  /** F-060: override opcional do posicionamento FULL para este segmento. */
  full?: Partial<YoutubeFullConfig>;
}

export interface YoutubeSharedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface YoutubeSharedConfig {
  telas: YoutubeSharedScreenCount;
  crop_facecam: YoutubeSharedRect;
  crop_tela: YoutubeSharedRect;
  slot_facecam: YoutubeSharedRect;
  slot_tela: YoutubeSharedRect;
}

/**
 * F-060: posicionamento do modo FULL — crop do bruto + encaixe no canvas.
 * Default = quadro inteiro → tela inteira (comportamento clássico do FULL,
 * sem palco). Espelha o `full` do backend (youtube_layout.py).
 */
export interface YoutubeFullConfig {
  crop: YoutubeSharedRect;
  slot: YoutubeSharedRect;
}

export interface YoutubePlaca {
  nome: string;
  papel: string;
}

export interface YoutubeLayout {
  modo_padrao: YoutubeLayoutMode;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  regioes: YoutubeLayoutRegion[];
  compartilhada: YoutubeSharedConfig;
  /**
   * I-029 v2: padrao de posicionamento para SEGMENTOS deste corte (apenas
   * deste corte — nao se propaga para o projeto/global). Quando definido,
   * o usuario pode aplica-lo via split-button no card "Definir padroes" e
   * usa-lo como referencia para novas regioes.
   *
   * Opcional para nao quebrar cortes antigos.
   */
  compartilhada_segmento?: YoutubeSharedConfig;
  /** F-060: posicionamento do modo FULL (sempre presente apos normalize). */
  full: YoutubeFullConfig;
  /** F-060: padrao de posicionamento FULL para segmentos deste corte. */
  full_segmento?: YoutubeFullConfig;
}
