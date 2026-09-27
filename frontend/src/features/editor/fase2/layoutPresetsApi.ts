import { api, dados, type Schema } from '@/shared/api';
import type {
  AtualizarLayoutPresetRequest,
  CriarLayoutPresetRequest,
  LayoutPreset,
  LayoutPresetTipo,
} from '@/types/presets';

// Os presets de layout (F-048 / F-060), do palco do YouTube ao do short. D-722:
// saíram de lib/api.ts, sobre o cliente gerado.
//
// O contrato leva o `payload` como objeto livre porque a forma dele muda com o
// `tipo`; quem descreve cada forma são os tipos de `types/presets`, e é por
// eles que a tela lê. A conversão fica aqui, num lugar só.

type PresetDoContrato = Schema<'LayoutPresetResponse'>;

const pelosTiposDaTela = (preset: PresetDoContrato) => preset as unknown as LayoutPreset;
// Os tipos da tela são interfaces, sem assinatura de índice: o TypeScript não
// os aceita como objeto livre sem dizer que é isso mesmo.
const comoObjetoLivre = <T extends { payload?: unknown }>(body: T) =>
  body as T & { payload: Record<string, unknown> };

export const layoutPresetsApi = {
  listarLayoutPresets: async (tipo?: LayoutPresetTipo) =>
    (await dados(api.GET('/api/presets/layout', { params: { query: { tipo } } }))).map(
      pelosTiposDaTela,
    ),

  criarLayoutPreset: async (body: CriarLayoutPresetRequest) =>
    pelosTiposDaTela(await dados(api.POST('/api/presets/layout', { body: comoObjetoLivre(body) }))),

  atualizarLayoutPreset: async (id: string, body: AtualizarLayoutPresetRequest) =>
    pelosTiposDaTela(
      await dados(
        api.PUT('/api/presets/layout/{preset_id}', {
          params: { path: { preset_id: id } },
          body: comoObjetoLivre(body),
        }),
      ),
    ),

  deletarLayoutPreset: async (id: string): Promise<void> => {
    await api.DELETE('/api/presets/layout/{preset_id}', { params: { path: { preset_id: id } } });
  },
};
