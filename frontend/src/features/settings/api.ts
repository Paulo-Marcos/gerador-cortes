import type { LogLevel } from '@/types/models';
import { api, dados, type Schema } from '@/shared/api';

// Os ajustes do app (D-191: no banco, por canal) e a geometria da capa do TikTok
// para o editor de layout (D-532). D-722: saiu de lib/api.ts para a feature,
// sobre o cliente gerado. Editor, revisão final, pós-produção e dois hooks
// também leem os ajustes, e importam daqui.

export type AtualizarSettingsBody = Schema<'UpdateAppSettingsRequest'>;
export type LayoutCapaTiktok = Schema<'LayoutCapaTiktokResponse'>;

export const settingsApi = {
  obterSettings: () => dados(api.GET('/api/settings')),

  /** Aceita só o nível de log (chamadores antigos) ou os campos a mudar. */
  atualizarSettings: (body: LogLevel | AtualizarSettingsBody) =>
    dados(
      api.PUT('/api/settings', {
        body: typeof body === 'string' ? { log_level: body } : body,
      }),
    ),

  /** A geometria resolvida da capa: o editor não recalcula, pede pronta. */
  obterLayoutCapaTiktok: () => dados(api.GET('/api/settings/capa-tiktok/layout')),
};
