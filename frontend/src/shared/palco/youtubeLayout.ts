import type { CenaRemotion } from '@/types/models';
import type {
  YoutubeLayoutMode,
  YoutubeSharedScreenCount,
  YoutubeBackgroundId,
  YoutubeLayoutRegion,
  YoutubeSharedRect,
  YoutubeSharedConfig,
  YoutubeFullConfig,
  YoutubePlaca,
  YoutubeLayout,
} from '@/types/youtubeLayout';

export type {
  YoutubeLayoutMode,
  YoutubeSharedScreenCount,
  YoutubeBackgroundId,
  YoutubeLayoutRegion,
  YoutubeSharedRect,
  YoutubeSharedConfig,
  YoutubeFullConfig,
  YoutubePlaca,
  YoutubeLayout,
} from '@/types/youtubeLayout';

import { normalizeZonaCard, zonasCardIguais } from '@/shared/palco/zonaCard';

export { ZONA_CARD_MINIMA, normalizeZonaCard, sharedVerticalCardZone } from '@/shared/palco/zonaCard';

export const YOUTUBE_BACKGROUND_IDS: readonly YoutubeBackgroundId[] = [
  'hud-forte',
  'topo-estrutural',
  'hud-topo',
  'architectural-hud',
  'topographic',
  'cosmograph',
];

export const DEFAULT_YOUTUBE_BACKGROUND: YoutubeBackgroundId = 'hud-forte';

export const DEFAULT_PLACA: YoutubePlaca = { nome: '', papel: '' };

export const DEFAULT_FULL_CONFIG: YoutubeFullConfig = {
  crop: { x: 0, y: 0, w: 1920, h: 1080 },
  slot: { x: 0, y: 0, w: 1920, h: 1080 },
};

export const DEFAULT_YOUTUBE_LAYOUT: YoutubeLayout = {
  modo_padrao: 'full',
  fundo: DEFAULT_YOUTUBE_BACKGROUND,
  placa: { ...DEFAULT_PLACA },
  regioes: [],
  compartilhada: {
    telas: 2,
    crop_facecam: { x: 24, y: 410, w: 340, h: 260 },
    crop_tela: { x: 365, y: 180, w: 1325, h: 720 },
    slot_facecam: { x: 54, y: 405, w: 340, h: 260 },
    slot_tela: { x: 500, y: 150, w: 1325, h: 720 },
  },
  full: {
    crop: { ...DEFAULT_FULL_CONFIG.crop },
    slot: { ...DEFAULT_FULL_CONFIG.slot },
  },
};

const LEGACY_SLOT_FACECAM = { x: 54, y: 405, w: 390, h: 292 };
const LEGACY_SLOT_TELA = { x: 500, y: 150, w: 1325, h: 745 };

/**
 * F-048: resolve layout aplicando cascade lazy global -> projeto -> corte.
 * Espelha `resolver_layout_em_cascata` do backend para que preview e render
 * batam visualmente.
 */
export function resolveLayoutChain(
  corteLayout?: unknown,
  projetoPadrao?: unknown,
  globalPadrao?: unknown,
): YoutubeLayout {
  const globalNorm = normalizeYoutubeLayout(globalPadrao);
  const projetoNorm = normalizeYoutubeLayout(projetoPadrao, globalNorm);
  return normalizeYoutubeLayout(corteLayout, projetoNorm);
}

export function normalizeYoutubeLayout(value: unknown, fallbackValue?: unknown): YoutubeLayout {
  let fallback = DEFAULT_YOUTUBE_LAYOUT;
  if (fallbackValue && fallbackValue !== value) {
    let parsedFallback = fallbackValue;
    if (typeof fallbackValue === 'string') {
      try {
        parsedFallback = JSON.parse(fallbackValue);
      } catch {
        parsedFallback = {};
      }
    }
    fallback = normalizeYoutubeLayout(parsedFallback);
  }

  // I-025: parse simétrico — `value` também pode chegar como string serializada
  // (projeto.layout_youtube_padrao e appSettings.youtube_layout_padrao_global
  // são Text no backend). Sem isso, o cascade em resolveLayoutChain descartava
  // silenciosamente projeto/global e todo corte nascia em 'full'.
  let parsedValue: unknown = value;
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = null;
    }
  }

  // D-712: o nível ausente herda do de cima — mas só o que cascateia. Regiões
  // e padrões de SEGMENTO são deste corte (I-029 v2) e nunca descem do projeto
  // ou do global, como no backend (`normalizar_layout_youtube`).
  if (!parsedValue || typeof parsedValue !== 'object') return herdadoDo(fallback);
  const raw = parsedValue as Partial<YoutubeLayout>;
  const cropFacecam = normalizeRect(
    raw.compartilhada?.crop_facecam,
    fallback.compartilhada.crop_facecam,
  );
  const cropTela = normalizeRect(raw.compartilhada?.crop_tela, fallback.compartilhada.crop_tela);
  const telas = normalizeScreenCount(raw.compartilhada?.telas, fallback.compartilhada.telas);
  const slotFacecam = normalizeSlotRect(
    normalizeRect(raw.compartilhada?.slot_facecam, fallback.compartilhada.slot_facecam),
    cropFacecam,
    fallback.compartilhada.slot_facecam,
    LEGACY_SLOT_FACECAM,
  );
  const slotTela = normalizeSlotRect(
    normalizeRect(raw.compartilhada?.slot_tela, fallback.compartilhada.slot_tela),
    cropTela,
    fallback.compartilhada.slot_tela,
    LEGACY_SLOT_TELA,
  );
  // D-904: a zona dos cards do corte vence a herdada; sem nenhuma, a chave
  // fica ausente (regra automática) — espelha `_aplicar_compartilhada`.
  const zonaCard =
    normalizeZonaCard(raw.compartilhada?.zona_card) ?? fallback.compartilhada.zona_card;

  // F-060: posicionamento FULL (crop + slot proporcional ao crop).
  const fullConfig = normalizeFullConfig(raw.full, fallback.full);
  const rawFullSegmento = (raw as unknown as { full_segmento?: unknown }).full_segmento;
  const fullSegmento =
    rawFullSegmento && typeof rawFullSegmento === 'object'
      ? normalizeFullConfig(rawFullSegmento, fullConfig)
      : undefined;

  // I-029 v2: padrao opcional de SEGMENTO (so para este corte). Quando o
  // campo nao existe ou eh objeto inválido, o normalize devolve undefined
  // (nao polui o JSON com defaults artificiais — assim ainda da pra
  // distinguir "definido" de "herdando").
  const compartilhadaSegmento = normalizeSegmentoCompartilhada(
    (raw as unknown as { compartilhada_segmento?: unknown }).compartilhada_segmento,
    fallback.compartilhada,
    zonaCard,
  );

  const normalized: YoutubeLayout = {
    // D-966 (RN-10): modo gravado é decisão; ausente herda. Adivinhar pela
    // sentinela {modo_padrao:'full', regioes:[]} fazia o FULL escolhido num
    // projeto COMP voltar a COMP, e a região nova virar o corte em FULL.
    modo_padrao: normalizeMode(raw.modo_padrao) ?? fallback.modo_padrao,
    fundo: normalizeBackground(raw.fundo, fallback.fundo),
    placa: normalizePlaca(raw.placa, fallback.placa),
    regioes: Array.isArray(raw.regioes)
      ? raw.regioes
          .map(normalizeRegion)
          .filter((region): region is YoutubeLayoutRegion => Boolean(region))
          .sort((a, b) => a.inicio - b.inicio || a.fim - b.fim)
      : [],
    compartilhada: {
      telas,
      crop_facecam: cropFacecam,
      crop_tela: cropTela,
      slot_facecam: slotFacecam,
      slot_tela: slotTela,
    },
    full: fullConfig,
  };
  if (zonaCard) {
    normalized.compartilhada.zona_card = { ...zonaCard };
  }
  if (compartilhadaSegmento) {
    normalized.compartilhada_segmento = compartilhadaSegmento;
  }
  if (fullSegmento) {
    normalized.full_segmento = fullSegmento;
  }
  return normalized;
}

/**
 * I-029 v2: o padrão de SEGMENTO deste corte. `undefined` quando o campo não
 * existe ou é ilegível — a chave ausente distingue "definido" de "herdando".
 * A zona dos cards do corte (`zonaCard`) vale como base, como no backend
 * (`_aplicar_padroes_de_segmento` parte de `merge_compartilhada`).
 */
function normalizeSegmentoCompartilhada(
  rawSegmento: unknown,
  fallback: YoutubeSharedConfig,
  zonaCard: YoutubeSharedRect | undefined,
): YoutubeSharedConfig | undefined {
  if (!rawSegmento || typeof rawSegmento !== 'object') return undefined;
  const raw = rawSegmento as Partial<YoutubeSharedConfig>;
  const cropFacecam = normalizeRect(raw.crop_facecam, fallback.crop_facecam);
  const cropTela = normalizeRect(raw.crop_tela, fallback.crop_tela);
  const segmento: YoutubeSharedConfig = {
    telas: normalizeScreenCount(raw.telas, fallback.telas),
    crop_facecam: cropFacecam,
    crop_tela: cropTela,
    slot_facecam: normalizeSlotRect(
      normalizeRect(raw.slot_facecam, fallback.slot_facecam),
      cropFacecam,
      fallback.slot_facecam,
      LEGACY_SLOT_FACECAM,
    ),
    slot_tela: normalizeSlotRect(
      normalizeRect(raw.slot_tela, fallback.slot_tela),
      cropTela,
      fallback.slot_tela,
      LEGACY_SLOT_TELA,
    ),
  };
  const segZonaCard = normalizeZonaCard(raw.zona_card) ?? zonaCard;
  if (segZonaCard) segmento.zona_card = segZonaCard;
  return segmento;
}

function normalizeFullConfig(value: unknown, fallback: YoutubeFullConfig): YoutubeFullConfig {
  if (!value || typeof value !== 'object') {
    return { crop: { ...fallback.crop }, slot: { ...fallback.slot } };
  }
  const raw = value as Partial<YoutubeFullConfig>;
  const crop = normalizeRect(raw.crop, fallback.crop);
  const slot = normalizeRect(raw.slot, fallback.slot);
  // Slot mantém a proporção do crop (sem distorção), como na compartilhada.
  const scale = Math.max(0.01, Math.min(slot.w / crop.w, slot.h / crop.h));
  return {
    crop,
    slot: normalizeRect(
      { ...slot, w: Math.round(crop.w * scale), h: Math.round(crop.h * scale) },
      DEFAULT_FULL_CONFIG.slot,
    ),
  };
}

export function resolveYoutubeModeAt(layout: YoutubeLayout, time: number): YoutubeLayoutMode {
  let mode = layout.modo_padrao;
  for (const region of layout.regioes) {
    if (region.inicio <= time && time < region.fim) mode = region.modo;
  }
  return mode;
}

export function resolveYoutubeModeForScene(
  layout: YoutubeLayout,
  cena: Pick<CenaRemotion, 'inicio' | 'fim'>,
) {
  const inicio = Number.isFinite(cena.inicio) ? cena.inicio : 0;
  const fim = Number.isFinite(cena.fim) && cena.fim > inicio ? cena.fim : inicio + 5;
  return resolveYoutubeModeAt(layout, (inicio + fim) / 2);
}

export function resolveCardLayoutForScene(
  cena: CenaRemotion,
  _layout: YoutubeLayout,
  fallback: 'horizontal' | 'vertical',
) {
  if (cena.layout_card === 'horizontal' || cena.layout_card === 'vertical') return cena.layout_card;
  return fallback;
}

export function sharedRegions(layout: YoutubeLayout, duration: number): YoutubeLayoutRegion[] {
  const safeDuration = Math.max(0, duration);
  const intervals: YoutubeLayoutRegion[] =
    layout.modo_padrao === 'compartilhada'
      ? [{ inicio: 0, fim: safeDuration, modo: 'compartilhada' }]
      : layout.regioes.filter((region) => region.modo === 'compartilhada');

  const carved = layout.regioes.reduce<YoutubeLayoutRegion[]>((current, region) => {
    if (region.modo !== 'full') return current;
    return current.flatMap((interval) => subtractRegion(interval, region));
  }, intervals);

  return carved
    .map((region) => ({
      ...region,
      inicio: clamp(region.inicio, 0, safeDuration),
      fim: clamp(region.fim, 0, safeDuration),
    }))
    .filter((region) => region.fim > region.inicio)
    .sort((a, b) => a.inicio - b.inicio);
}

function normalizeRegion(value: unknown): YoutubeLayoutRegion | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<YoutubeLayoutRegion>;
  const inicio = Math.max(0, toNumber(raw.inicio, 0));
  const fim = Math.max(inicio, toNumber(raw.fim, inicio));
  if (fim <= inicio) return null;
  const regiao: YoutubeLayoutRegion = {
    inicio: round(inicio),
    fim: round(fim),
    modo: normalizeMode(raw.modo) ?? 'compartilhada',
  };
  const override = normalizeRegionOverride(raw.compartilhada);
  if (override) regiao.compartilhada = override;
  const overrideFull = normalizeRegionFullOverride(raw.full);
  if (overrideFull) regiao.full = overrideFull;
  return regiao;
}

function normalizeRegionFullOverride(value: unknown): Partial<YoutubeFullConfig> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<YoutubeFullConfig>;
  const result: Partial<YoutubeFullConfig> = {};
  if (raw.crop !== undefined) {
    result.crop = normalizeRect(raw.crop, DEFAULT_FULL_CONFIG.crop);
  }
  if (raw.slot !== undefined) {
    result.slot = normalizeRect(raw.slot, DEFAULT_FULL_CONFIG.slot);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeRegionOverride(value: unknown): Partial<YoutubeSharedConfig> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<YoutubeSharedConfig>;
  const result: Partial<YoutubeSharedConfig> = {};
  if (raw.telas !== undefined) {
    result.telas = normalizeScreenCount(raw.telas, DEFAULT_YOUTUBE_LAYOUT.compartilhada.telas);
  }
  if (raw.crop_facecam !== undefined) {
    result.crop_facecam = normalizeRect(
      raw.crop_facecam,
      DEFAULT_YOUTUBE_LAYOUT.compartilhada.crop_facecam,
    );
  }
  if (raw.crop_tela !== undefined) {
    result.crop_tela = normalizeRect(raw.crop_tela, DEFAULT_YOUTUBE_LAYOUT.compartilhada.crop_tela);
  }
  if (raw.slot_facecam !== undefined) {
    result.slot_facecam = normalizeRect(
      raw.slot_facecam,
      DEFAULT_YOUTUBE_LAYOUT.compartilhada.slot_facecam,
    );
  }
  if (raw.slot_tela !== undefined) {
    result.slot_tela = normalizeRect(raw.slot_tela, DEFAULT_YOUTUBE_LAYOUT.compartilhada.slot_tela);
  }
  const zonaCard = normalizeZonaCard(raw.zona_card);
  if (zonaCard) result.zona_card = zonaCard;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * F-048: combina o config base do corte com o override de um segmento.
 * Override parcial — campos ausentes herdam de `base`. Sempre retorna copia
 * nova; nao muta `base` nem `override`.
 */
export function mergeSharedConfig(
  base: YoutubeSharedConfig,
  override: Partial<YoutubeSharedConfig> | undefined | null,
): YoutubeSharedConfig {
  const merged: YoutubeSharedConfig = {
    telas: base.telas,
    crop_facecam: { ...base.crop_facecam },
    crop_tela: { ...base.crop_tela },
    slot_facecam: { ...base.slot_facecam },
    slot_tela: { ...base.slot_tela },
  };
  // D-904: a zona dos cards só existe no resultado quando alguém a definiu.
  if (base.zona_card) merged.zona_card = { ...base.zona_card };
  if (!override) return merged;
  if (override.telas !== undefined) merged.telas = override.telas;
  if (override.crop_facecam) merged.crop_facecam = { ...override.crop_facecam };
  if (override.crop_tela) merged.crop_tela = { ...override.crop_tela };
  if (override.slot_facecam) merged.slot_facecam = { ...override.slot_facecam };
  if (override.slot_tela) merged.slot_tela = { ...override.slot_tela };
  if (override.zona_card) merged.zona_card = { ...override.zona_card };
  return merged;
}

/**
 * F-048: config efetivo de uma regiao (override > base do corte). Quando a
 * regiao nao tem override, devolve o config do corte intocado.
 */
export function resolveSharedConfigForRegion(
  layout: YoutubeLayout,
  region: YoutubeLayoutRegion,
): YoutubeSharedConfig {
  return mergeSharedConfig(layout.compartilhada, region.compartilhada);
}

/** F-060: combina o config FULL base com o override de um segmento. */
export function mergeFullConfig(
  base: YoutubeFullConfig,
  override: Partial<YoutubeFullConfig> | undefined | null,
): YoutubeFullConfig {
  const merged: YoutubeFullConfig = {
    crop: { ...base.crop },
    slot: { ...base.slot },
  };
  if (!override) return merged;
  if (override.crop) merged.crop = { ...override.crop };
  if (override.slot) merged.slot = { ...override.slot };
  return merged;
}

export function fullConfigEquals(a: YoutubeFullConfig, b: YoutubeFullConfig): boolean {
  return rectsEqual(a.crop, b.crop) && rectsEqual(a.slot, b.slot);
}

/** F-060: FULL default = quadro inteiro → tela inteira (sem crop nem palco). */
export function isDefaultFullConfig(config: YoutubeFullConfig): boolean {
  return fullConfigEquals(config, DEFAULT_FULL_CONFIG);
}

/** F-060: config efetivo FULL de uma regiao (override > base do corte). */
export function resolveFullConfigForRegion(
  layout: YoutubeLayout,
  region: YoutubeLayoutRegion,
): YoutubeFullConfig {
  return mergeFullConfig(layout.full, region.full);
}

/** F-060: config FULL efetivo no instante `time` (ultimo segmento full que cobre). */
export function resolveFullConfigAtTime(layout: YoutubeLayout, time: number): YoutubeFullConfig {
  let override: Partial<YoutubeFullConfig> | undefined;
  for (const region of layout.regioes) {
    if (region.modo !== 'full') continue;
    if (region.inicio <= time && time < region.fim && region.full) {
      override = region.full;
    }
  }
  return mergeFullConfig(layout.full, override);
}

/**
 * F-060: traduz o config FULL para o config de palco de 1 tela. O FULL
 * posicionado renderiza pelo MESMO pipeline do compartilhado de tela unica
 * (fundo + chrome + placa): crop/slot viram crop_tela/slot_tela. Espelha
 * `config_compartilhada_para_full` no backend (paridade preview/render).
 */
export function sharedConfigFromFull(full: YoutubeFullConfig): YoutubeSharedConfig {
  return {
    telas: 1,
    crop_facecam: { ...DEFAULT_YOUTUBE_LAYOUT.compartilhada.crop_facecam },
    crop_tela: { ...full.crop },
    slot_facecam: { ...DEFAULT_YOUTUBE_LAYOUT.compartilhada.slot_facecam },
    slot_tela: { ...full.slot },
  };
}

/**
 * F-048: config efetivo no instante `time`. Pega o ULTIMO segmento
 * `modo=compartilhada` que contem `time` e usa o override dele (se houver);
 * sem cobertura, devolve o config base do corte.
 */
export function resolveSharedConfigAtTime(
  layout: YoutubeLayout,
  time: number,
): YoutubeSharedConfig {
  let override: Partial<YoutubeSharedConfig> | undefined;
  for (const region of layout.regioes) {
    if (region.modo !== 'compartilhada') continue;
    if (region.inicio <= time && time < region.fim && region.compartilhada) {
      override = region.compartilhada;
    }
  }
  return mergeSharedConfig(layout.compartilhada, override);
}

/** F-060: shape minimo aceito pelos extratores de preset. */
export interface PresetLike {
  tipo: 'completo' | 'posicionamento' | 'posicionamento_full';
  payload: unknown;
}

/**
 * F-048: extrai o YoutubeSharedConfig embutido em um preset ('completo' ou
 * 'posicionamento'). Retorna null se o preset nao tiver compartilhada.
 *
 * F-060: o payload de 'posicionamento' pode vir no shape novo
 * `{ compartilhada, fundo, placa }` ou no legado (SharedConfig direto).
 */
export function sharedConfigDoPreset(preset: PresetLike): YoutubeSharedConfig | null {
  if (preset.tipo === 'posicionamento_full') return null;
  if (preset.tipo === 'posicionamento') {
    const payload = preset.payload as
      | (Partial<YoutubeSharedConfig> & { compartilhada?: Partial<YoutubeSharedConfig> })
      | null
      | undefined;
    if (!payload) return null;
    const cfg = payload.compartilhada ?? payload;
    return mergeSharedConfig(DEFAULT_YOUTUBE_LAYOUT.compartilhada, cfg);
  }
  const layout = preset.payload as Partial<YoutubeLayout> | null | undefined;
  if (!layout?.compartilhada) return null;
  return mergeSharedConfig(DEFAULT_YOUTUBE_LAYOUT.compartilhada, layout.compartilhada);
}

/** F-060: extrai o YoutubeFullConfig de um preset ('completo' ou 'posicionamento_full'). */
export function fullConfigDoPreset(preset: PresetLike): YoutubeFullConfig | null {
  if (preset.tipo === 'posicionamento_full') {
    const payload = preset.payload as { full?: Partial<YoutubeFullConfig> } | null | undefined;
    if (!payload?.full) return null;
    return mergeFullConfig(DEFAULT_FULL_CONFIG, payload.full);
  }
  if (preset.tipo === 'completo') {
    const layout = preset.payload as Partial<YoutubeLayout> | null | undefined;
    if (!layout?.full) return null;
    return mergeFullConfig(DEFAULT_FULL_CONFIG, layout.full);
  }
  return null;
}

/**
 * F-060: fundo e placa carregados pelo preset. Presets legados (payload sem
 * fundo/placa) devolvem `{}` — quem aplica mantem o fundo/placa atuais.
 */
export function fundoPlacaDoPreset(preset: PresetLike): {
  fundo?: YoutubeBackgroundId;
  placa?: YoutubePlaca;
} {
  const payload = preset.payload as { fundo?: unknown; placa?: unknown } | null | undefined;
  if (!payload || typeof payload !== 'object') return {};
  const result: { fundo?: YoutubeBackgroundId; placa?: YoutubePlaca } = {};
  if (payload.fundo != null) result.fundo = normalizeBackground(payload.fundo);
  if (payload.placa != null && typeof payload.placa === 'object') {
    result.placa = normalizePlaca(payload.placa);
  }
  return result;
}

function rectsEqual(a: YoutubeSharedRect, b: YoutubeSharedRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function sharedConfigEquals(a: YoutubeSharedConfig, b: YoutubeSharedConfig): boolean {
  return (
    a.telas === b.telas &&
    rectsEqual(a.crop_facecam, b.crop_facecam) &&
    rectsEqual(a.crop_tela, b.crop_tela) &&
    rectsEqual(a.slot_facecam, b.slot_facecam) &&
    rectsEqual(a.slot_tela, b.slot_tela) &&
    zonasCardIguais(a.zona_card, b.zona_card)
  );
}

/**
 * F-048: dado uma lista de presets e um config, devolve o PRIMEIRO preset que
 * tem o mesmo `compartilhada`. Permite identificar qual preset esta em uso em
 * cada escopo (Corte/Projeto/Global/Segmento) para exibir o nome na UI.
 */
export function findMatchingPreset<T extends PresetLike>(
  presets: readonly T[],
  config: YoutubeSharedConfig,
): T | null {
  for (const preset of presets) {
    const presetConfig = sharedConfigDoPreset(preset);
    if (presetConfig && sharedConfigEquals(presetConfig, config)) return preset;
  }
  return null;
}

/** F-060: analogo de findMatchingPreset para o posicionamento FULL. */
export function findMatchingFullPreset<T extends PresetLike>(
  presets: readonly T[],
  config: YoutubeFullConfig,
): T | null {
  for (const preset of presets) {
    const presetConfig = fullConfigDoPreset(preset);
    if (presetConfig && fullConfigEquals(presetConfig, config)) return preset;
  }
  return null;
}

function normalizeMode(value: unknown): YoutubeLayoutMode | null {
  const mode = String(value ?? '')
    .toLowerCase()
    .trim();
  if (mode === 'full' || mode === 'padrao' || mode === 'tela_cheia') return 'full';
  if (mode === 'compartilhada' || mode === 'shared' || mode === 'screen_share')
    return 'compartilhada';
  return null;
}

function normalizeBackground(
  value: unknown,
  fallback: YoutubeBackgroundId = DEFAULT_YOUTUBE_BACKGROUND,
): YoutubeBackgroundId {
  if (value == null || value === '') return fallback;
  const id = String(value ?? '')
    .toLowerCase()
    .trim();
  return (YOUTUBE_BACKGROUND_IDS as readonly string[]).includes(id)
    ? (id as YoutubeBackgroundId)
    : fallback;
}

function normalizePlaca(value: unknown, fallback: YoutubePlaca = DEFAULT_PLACA): YoutubePlaca {
  if (!value || typeof value !== 'object') return { ...fallback };
  const raw = value as Partial<YoutubePlaca>;
  return {
    nome: typeof raw.nome === 'string' ? raw.nome.slice(0, 80) : fallback.nome,
    papel: typeof raw.papel === 'string' ? raw.papel.slice(0, 80) : fallback.papel,
  };
}

function normalizeScreenCount(
  value: unknown,
  fallback: YoutubeSharedScreenCount = 2,
): YoutubeSharedScreenCount {
  const count = Number(value);
  return count === 1 || count === 2 ? count : fallback;
}

function normalizeRect(value: unknown, fallback: YoutubeSharedRect): YoutubeSharedRect {
  if (!value || typeof value !== 'object') return { ...fallback };
  const raw = value as Partial<YoutubeSharedRect>;
  const w = clamp(Math.round(toNumber(raw.w, fallback.w)), 1, 1920);
  const h = clamp(Math.round(toNumber(raw.h, fallback.h)), 1, 1080);
  return {
    x: clamp(Math.round(toNumber(raw.x, fallback.x)), 0, 1920 - w),
    y: clamp(Math.round(toNumber(raw.y, fallback.y)), 0, 1080 - h),
    w,
    h,
  };
}

function normalizeSlotRect(
  slot: YoutubeSharedRect,
  crop: YoutubeSharedRect,
  fallback: YoutubeSharedRect,
  legacy: YoutubeSharedRect,
): YoutubeSharedRect {
  if (sameRect(slot, legacy)) return { ...fallback };
  const scale = Math.max(0.01, Math.min(slot.w / crop.w, slot.h / crop.h));
  return normalizeRect(
    {
      ...slot,
      w: Math.round(crop.w * scale),
      h: Math.round(crop.h * scale),
    },
    fallback,
  );
}

function sameRect(a: YoutubeSharedRect, b: YoutubeSharedRect) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function subtractRegion(
  base: YoutubeLayoutRegion,
  cut: YoutubeLayoutRegion,
): YoutubeLayoutRegion[] {
  if (cut.fim <= base.inicio || cut.inicio >= base.fim) return [base];
  const next: YoutubeLayoutRegion[] = [];
  if (base.inicio < cut.inicio) {
    next.push({ ...base, fim: Math.max(base.inicio, cut.inicio) });
  }
  if (cut.fim < base.fim) {
    next.push({ ...base, inicio: Math.min(base.fim, cut.fim) });
  }
  return next;
}

function cloneLayout(layout: YoutubeLayout): YoutubeLayout {
  return JSON.parse(JSON.stringify(layout)) as YoutubeLayout;
}

/** O que um nível ausente herda do de cima: tudo, menos o que é do corte. */
function herdadoDo(fallback: YoutubeLayout): YoutubeLayout {
  const herdado = cloneLayout(fallback) as YoutubeLayout & Record<string, unknown>;
  delete herdado.compartilhada_segmento;
  delete herdado.full_segmento;
  return { ...herdado, regioes: [] };
}

function toNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

// ─── D-741: o corte grava só as chaves que o operador mudou ─────────────────
//
// RN-10 / ADR-0013: o padrão se materializa na LEITURA. O backend faz um JSON
// Merge Patch no primeiro nível (`mesclar_no_layout_do_corte`): chave enviada
// substitui, `null` volta a herdar, ausente fica. Estas três funções são o lado
// da tela: mandar só o que mudou e manter no cache o layout GRAVADO — nunca o
// resolvido pela cascata, que é o que fazia o corte parar de herdar.

type LayoutCru = Record<string, unknown>;

function comoObjeto(valor: unknown): LayoutCru {
  if (typeof valor === 'string') {
    try {
      return comoObjeto(JSON.parse(valor));
    } catch {
      return {};
    }
  }
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? { ...(valor as LayoutCru) }
    : {};
}

/** O corte não decidiu o modo (chave ausente ou ilegível): ele herda (D-966). */
export function modoHerdado(layoutGravado: unknown): boolean {
  return normalizeMode(comoObjeto(layoutGravado).modo_padrao) === null;
}

/** As chaves de primeiro nível cujo valor mudou de `antes` para `depois`. */
export function chavesMudadas(antes: YoutubeLayout, depois: YoutubeLayout): Partial<YoutubeLayout> {
  const a = antes as unknown as LayoutCru;
  const d = depois as unknown as LayoutCru;
  const mudadas: LayoutCru = {};
  for (const chave of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (JSON.stringify(a[chave]) !== JSON.stringify(d[chave])) {
      mudadas[chave] = d[chave] ?? null;
    }
  }
  return mudadas as Partial<YoutubeLayout>;
}

/** O layout gravado depois de aplicar `mudancas` — a mesma regra do backend. */
export function mesclarNoLayoutDoCorte(atual: unknown, mudancas: LayoutCru): LayoutCru {
  const layout = comoObjeto(atual);
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor === null) delete layout[chave];
    else layout[chave] = valor;
  }
  return layout;
}

/** O patch que devolve o layout gravado de `atual` para `alvo` (o desfazer). */
export function patchParaRestaurar(atual: unknown, alvo: unknown): LayoutCru {
  const de = comoObjeto(atual);
  const para = comoObjeto(alvo);
  const patch: LayoutCru = { ...para };
  for (const chave of Object.keys(de)) {
    if (!(chave in para)) patch[chave] = null;
  }
  return patch;
}
