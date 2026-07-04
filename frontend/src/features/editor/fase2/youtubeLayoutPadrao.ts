import {
  normalizeYoutubeLayout,
  type YoutubeLayout,
  type YoutubeLayoutMode,
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
