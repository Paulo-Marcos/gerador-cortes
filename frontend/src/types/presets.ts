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

export type LayoutPresetTipo = 'completo' | 'posicionamento' | 'posicionamento_full';

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
  payload: YoutubeLayout | LayoutPosicionamentoPayload | LayoutPosicionamentoFullPayload;
}

export interface AtualizarLayoutPresetRequest {
  nome?: string;
  payload?: YoutubeLayout | LayoutPosicionamentoPayload | LayoutPosicionamentoFullPayload;
}
