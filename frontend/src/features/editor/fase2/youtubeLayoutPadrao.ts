import {
  normalizeYoutubeLayout,
  type YoutubeBackgroundId,
  type YoutubeFullConfig,
  type YoutubeLayout,
  type YoutubeLayoutMode,
  type YoutubePlaca,
  type YoutubeSharedConfig,
} from './youtubeLayout';

// ─────────────────────────────────────────────────────────────
// Helpers do "Padrao" do Layout YouTube (F-024 fase 4c).
// Extraidos do YoutubeLayoutPanel para serem unit-testaveis.
//
// O "Padrao" cobre fundo + placa + posicionamento (preset compartilhado).
// O `modo_padrao` (tipo do projeto: Full|Compartilhada) vive no MESMO
// JSON mas e tratado como conceito separado — preset salvo sempre vem
// com modo_padrao='compartilhada' (preset so faz sentido em Compartilhada).
// ─────────────────────────────────────────────────────────────

/**
 * Le o `modo_padrao` salvo no JSON (projeto.layout_youtube_padrao OU
 * appSettings.youtube_layout_padrao_global). Retorna null se vazio /
 * invalido. Usado para mostrar "Tipo do projeto: Full|Compartilhada".
 */
export function readPadraoModo(raw?: string | null): YoutubeLayoutMode | null {
  if (!raw || raw === '{}') return null;
  try {
    const parsed = JSON.parse(raw);
    const modo = (parsed?.modo_padrao ?? 'compartilhada') as YoutubeLayoutMode;
    return modo === 'full' || modo === 'compartilhada' ? modo : null;
  } catch {
    return null;
  }
}

/** Campos que um "Definir" pode escrever num escopo de padrao. */
export interface PadraoPatch {
  /** Modo com que novos cortes nascem. Sempre explicito — ver invariante abaixo. */
  modo_padrao: YoutubeLayoutMode;
  fundo?: YoutubeBackgroundId;
  placa?: YoutubePlaca;
  compartilhada?: YoutubeSharedConfig;
  full?: YoutubeFullConfig;
}

/** Modo de um escopo de padrao; sem nada salvo, novos cortes nascem em Full. */
export function modoPadraoDoEscopo(raw?: string | null): YoutubeLayoutMode {
  return readPadraoModo(raw) ?? 'full';
}

/**
 * Monta o JSON de padrao de um escopo (Projeto ou Global): parte do que ja esta
 * salvo e sobrepoe SO o que o `patch` traz.
 *
 * Invariante D-423: **definir posicionamento nunca muda o `modo_padrao`**, e
 * mudar o modo nunca apaga posicionamento. Quem decide o modo e o bloco "Modo"
 * do cabecalho, um controle so.
 *
 * Chave ausente continua ausente — de proposito. `resolver_layout_em_cascata`
 * (backend) e `resolveLayoutChain` (aqui) tratam cada nivel como PARCIAL: e a
 * ausencia da chave que faz o escopo cair para o proximo da escada. Materializar
 * defaults aqui pregaria o projeto num valor e cortaria a heranca do Global sem
 * ninguem ter pedido. Antes o painel remontava o JSON do zero a cada acao: ao
 * mudar o tipo do projeto omitia `full` (zerando o posicionamento Full salvo) e
 * ao salvar um preset carimbava o `modo_padrao: 'full'` do default.
 */
export function montarPadraoJson(
  padraoAtualJson: string | null | undefined,
  patch: PadraoPatch,
): string {
  let base: Record<string, unknown> = {};
  if (padraoAtualJson && padraoAtualJson !== '{}') {
    try {
      const parsed: unknown = JSON.parse(padraoAtualJson);
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>;
    } catch {
      // JSON corrompido no banco: parte do zero em vez de derrubar o painel.
    }
  }
  const novo: Record<string, unknown> = { ...base, modo_padrao: patch.modo_padrao };
  if (patch.fundo) novo.fundo = patch.fundo;
  if (patch.placa) novo.placa = patch.placa;
  if (patch.compartilhada) novo.compartilhada = patch.compartilhada;
  if (patch.full) novo.full = patch.full;
  return JSON.stringify(novo);
}

/**
 * Compara apenas o PRESET (fundo, placa, compartilhada, full) do draft com
 * um padrao serializado. Usado para responder "este corte esta usando
 * o padrao Projeto/Global ou esta Customizado?". `modo_padrao` nao
 * entra na comparacao (vive separado).
 */
export function draftMatchesPreset(draft: YoutubeLayout, padraoJson?: string | null): boolean {
  if (!padraoJson || padraoJson === '{}') return false;
  try {
    const padrao = normalizeYoutubeLayout(JSON.parse(padraoJson));
    const a = JSON.stringify({
      fundo: draft.fundo,
      placa: draft.placa,
      compartilhada: draft.compartilhada,
      full: draft.full,
    });
    const b = JSON.stringify({
      fundo: padrao.fundo,
      placa: padrao.placa,
      compartilhada: padrao.compartilhada,
      full: padrao.full,
    });
    return a === b;
  } catch {
    return false;
  }
}
