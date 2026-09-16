/**
 * Tipos para presets de layout YouTube (F-048 / F-060).
 *
 * Arquivo separado de `models.ts` (travado por outras features) — adicionar
 * tipos aqui evita unlock desnecessario do schema principal.
 */

import type {
  YoutubeBackgroundId,
  YoutubeFullConfig,
  YoutubeLayout,
  YoutubePlaca,
  YoutubeSharedConfig,
} from '@/features/editor/fase2/youtubeLayout';

export type LayoutPresetTipo =
  | 'completo'
  | 'posicionamento'
  | 'posicionamento_full'
  /** D-509: o palco do SHORT — catálogo próprio, vocabulário próprio. */
  | 'palco_short'
  /** D-594: a aparência do gancho da abertura. */
  | 'gancho_short';

/**
 * D-594: o que um preset de GANCHO guarda. Parcial de propósito: vazio e zero
 * são "este preset não decide", e o render cai no de sempre.
 */
export interface GanchoShortPreset {
  /** Hex do texto. Vazio = branco. */
  cor: string;
  /** veu | caixa | contorno | sombra | nenhum. Vazio = véu. */
  realce: string;
  /** Família da fonte. Vazio = a do canal. */
  fonte: string;
  /** Escala do corpo sobre 5% da altura. 0 = 1,0. */
  tamanho: number;
  /** Segundos em tela. 0 = 2,5s. */
  duracao: number;
  /** D-600: centro horizontal da caixa, em % da largura. 0 = não decide. */
  x: number;
  /** D-600: topo da caixa, em % da altura. 0 = não decide. */
  y: number;
  /** D-600: largura da caixa, em % da largura do quadro. 0 = não decide. */
  largura: number;
}

/** O que um preset de palco de short guarda (D-509). */
export interface PalcoShortPreset {
  arranjo: string;
  janela_cheia: string;
  /** O que cada janela mostra da live, em pixels do quadro-FONTE. */
  recortes: Record<string, { x: number; y: number; w: number; h: number }>;
  /** D-561: o tamanho/posição de cada janela no quadro do SHORT (1080x1920). */
  ajustes: Record<string, { x: number; y: number; w: number; h: number }>;
  /** A TEXTURA editorial (D-552). Presets antigos trazem aqui uma cor da paleta. */
  fundo: string;
  /** D-563: hex da palavra corrente da legenda. Vazio = o acento do canal. */
  legenda_cor: string;
  /** D-563: família da fonte da legenda. Vazio = a do canal. */
  legenda_fonte: string;
}

/**
 * F-060: payload novo do preset de posicionamento compartilhado. Presets
 * salvos antes da F-060 ainda podem vir como YoutubeSharedConfig direto —
 * use os helpers `sharedConfigDoPreset`/`fundoPlacaDoPreset` para ler.
 */
export interface LayoutPosicionamentoPayload {
  compartilhada: YoutubeSharedConfig;
  fundo?: YoutubeBackgroundId;
  placa?: YoutubePlaca;
}

/** F-060: payload do preset de posicionamento FULL. */
export interface LayoutPosicionamentoFullPayload {
  full: YoutubeFullConfig;
  fundo?: YoutubeBackgroundId;
  placa?: YoutubePlaca;
}

export interface LayoutPresetBase {
  id: string;
  nome: string;
  tipo: LayoutPresetTipo;
  criado_em: string;
  atualizado_em: string;
}

export interface LayoutPresetCompleto extends LayoutPresetBase {
  tipo: 'completo';
  payload: YoutubeLayout;
}

export interface LayoutPresetPosicionamento extends LayoutPresetBase {
  tipo: 'posicionamento';
  payload: LayoutPosicionamentoPayload | YoutubeSharedConfig;
}

export interface LayoutPresetPosicionamentoFull extends LayoutPresetBase {
  tipo: 'posicionamento_full';
  payload: LayoutPosicionamentoFullPayload;
}

export type LayoutPreset =
  | LayoutPresetCompleto
  | LayoutPresetPosicionamento
  | LayoutPresetPosicionamentoFull;

export interface CriarLayoutPresetRequest {
  nome: string;
  tipo: LayoutPresetTipo;
  payload:
    | YoutubeLayout
    | LayoutPosicionamentoPayload
    | LayoutPosicionamentoFullPayload
    | PalcoShortPreset
    | GanchoShortPreset;
}

export interface AtualizarLayoutPresetRequest {
  nome?: string;
  payload?:
    | YoutubeLayout
    | LayoutPosicionamentoPayload
    | LayoutPosicionamentoFullPayload
    | PalcoShortPreset
    | GanchoShortPreset;
}
