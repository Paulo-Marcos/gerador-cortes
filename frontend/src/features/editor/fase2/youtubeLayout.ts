import type { CenaRemotion } from '@/types/models';

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

export const YOUTUBE_BACKGROUND_IDS: readonly YoutubeBackgroundId[] = [
  'hud-forte',
  'topo-estrutural',
  'hud-topo',
  'architectural-hud',
  'topographic',
  'cosmograph',
];

export const DEFAULT_YOUTUBE_BACKGROUND: YoutubeBackgroundId = 'hud-forte';

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
      } catch (e) {
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

  if (!parsedValue || typeof parsedValue !== 'object') return cloneLayout(fallback);
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

  // Corte "intocado" (so a sentinela {modo_padrao:'full',regioes:[]}) JA INICIALIZA
  // com o modo do padrao do projeto (F-020). Assim que o usuario configura algo
  // (fundo/placa/posicoes/regioes ou escolhe compartilhada), vale o modo do corte.
  const corteConfigurado =
    raw.compartilhada != null ||
    raw.full != null ||
    raw.fundo != null ||
    raw.placa != null ||
    (Array.isArray(raw.regioes) && raw.regioes.length > 0) ||
    normalizeMode(raw.modo_padrao) === 'compartilhada';

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
  const rawSegmento = (raw as unknown as { compartilhada_segmento?: unknown })
    .compartilhada_segmento;
  let compartilhadaSegmento: YoutubeSharedConfig | undefined;
  if (rawSegmento && typeof rawSegmento === 'object') {
    const segCropFacecam = normalizeRect(
      (rawSegmento as Partial<YoutubeSharedConfig>).crop_facecam,
      fallback.compartilhada.crop_facecam,
    );
    const segCropTela = normalizeRect(
      (rawSegmento as Partial<YoutubeSharedConfig>).crop_tela,
      fallback.compartilhada.crop_tela,
    );
    compartilhadaSegmento = {
      telas: normalizeScreenCount(
        (rawSegmento as Partial<YoutubeSharedConfig>).telas,
        fallback.compartilhada.telas,
      ),
      crop_facecam: segCropFacecam,
      crop_tela: segCropTela,
      slot_facecam: normalizeSlotRect(
        normalizeRect(
          (rawSegmento as Partial<YoutubeSharedConfig>).slot_facecam,
          fallback.compartilhada.slot_facecam,
        ),
        segCropFacecam,
        fallback.compartilhada.slot_facecam,
        LEGACY_SLOT_FACECAM,
      ),
      slot_tela: normalizeSlotRect(
        normalizeRect(
          (rawSegmento as Partial<YoutubeSharedConfig>).slot_tela,
          fallback.compartilhada.slot_tela,
        ),
        segCropTela,
        fallback.compartilhada.slot_tela,
        LEGACY_SLOT_TELA,
      ),
    };
  }

  const normalized: YoutubeLayout = {
    modo_padrao: corteConfigurado
      ? (normalizeMode(raw.modo_padrao) ?? fallback.modo_padrao)
      : fallback.modo_padrao,
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
  if (compartilhadaSegmento) {
    normalized.compartilhada_segmento = compartilhadaSegmento;
  }
  if (fullSegmento) {
    normalized.full_segmento = fullSegmento;
  }
  return normalized;
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

export function sharedVerticalCardZone(config: YoutubeSharedConfig): YoutubeSharedRect {
  const margem = 48;
  const respiro = 28;

  if (config.telas === 1) {
    const tela = renderedSize(config.crop_tela, config.slot_tela);
    const telaRight = config.slot_tela.x + tela.w;
    const leftSpace = config.slot_tela.x - margem - respiro;
    const rightSpace = 1920 - telaRight - margem - respiro;
    const useRightSide = rightSpace > leftSpace;
    const left = useRightSide ? Math.min(1920 - margem - 240, telaRight + respiro) : margem;
    const right = useRightSide ? 1920 - margem : Math.max(left + 240, config.slot_tela.x - respiro);
    const top = Math.max(56, Math.min(config.slot_tela.y, 1080 - 236));
    const bottom = Math.max(top + 180, Math.min(1080 - 56, config.slot_tela.y + tela.h));

    return {
      x: Math.round(left),
      y: Math.round(top),
      w: Math.round(Math.max(240, right - left)),
      h: Math.round(Math.max(180, bottom - top)),
    };
  }

  // I-035: 2 telas — borda externa fixa define topo/esquerda; a tela grande
  // limita a direita e o facecam limita o alcance inferior. O topo usa respiro
  // maior que a lateral para o card nao colar no contorno do palco. Espelha
  // _zona_card_vertical_compartilhada no backend (paridade preview/render).
  const margemTopo = 96;
  const left = margem;
  const top = margemTopo;
  const right = Math.min(Math.max(config.slot_tela.x - respiro, left + 240), 1920 - margem);
  const bottom = Math.min(Math.max(config.slot_facecam.y - respiro, top + 180), 1080 - margem);

  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  };
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
  if (!override) return merged;
  if (override.telas !== undefined) merged.telas = override.telas;
  if (override.crop_facecam) merged.crop_facecam = { ...override.crop_facecam };
  if (override.crop_tela) merged.crop_tela = { ...override.crop_tela };
  if (override.slot_facecam) merged.slot_facecam = { ...override.slot_facecam };
  if (override.slot_tela) merged.slot_tela = { ...override.slot_tela };
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
    rectsEqual(a.slot_tela, b.slot_tela)
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

function renderedSize(crop: YoutubeSharedRect, slot: YoutubeSharedRect) {
  const scale = Math.max(0.01, Math.min(slot.w / crop.w, slot.h / crop.h));
  return { w: crop.w * scale, h: crop.h * scale };
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
