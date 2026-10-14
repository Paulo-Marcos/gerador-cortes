import type { LogLevel } from '@/types/models';
import { api, dados, type Schema } from '@/shared/api';

// Os ajustes do app (D-191: no banco, por canal) e a geometria da capa do TikTok
// para o editor de layout (D-532). D-722: saiu de lib/api.ts para a feature,
// sobre o cliente gerado. Editor, revisão final, pós-produção e dois hooks
// também leem os ajustes, e importam daqui.

export type AtualizarSettingsBody = Schema<'UpdateAppSettingsRequest'>;
export type LayoutCapaTiktok = Schema<'LayoutCapaTiktokResponse'>;
export type Navegador = Schema<'NavegadorDoRobo'>['navegador'];
export type RoboDoStudio = Schema<'RoboDoStudio'>;
export type PapelModelo = Schema<'PapelModeloResponse'>;
export type ModelosDisponiveis = Schema<'ModelosDisponiveisResponse'>;

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

  /** D-832: Chrome ou Edge para o robô do TikTok e do Instagram, no canal ativo. */
  obterNavegadorDoRobo: () => dados(api.GET('/api/channels/ativo/navegador-do-robo')),
  escolherNavegadorDoRobo: (navegador: Navegador) =>
    dados(api.PUT('/api/channels/ativo/navegador-do-robo', { body: { navegador } })),

  /** D-895: o que o robô do YouTube Studio faz depois do upload, no canal ativo. */
  obterRoboDoStudio: () => dados(api.GET('/api/channels/ativo/robo-do-studio')),
  gravarRoboDoStudio: (body: RoboDoStudio) =>
    dados(api.PUT('/api/channels/ativo/robo-do-studio', { body })),

  /** D-924: que modelo atende cada faixa de IA, no canal ativo. Vazio = padrão. */
  obterModelosIa: () => dados(api.GET('/api/editorial-skills/modelos-ia')),
  gravarModelosIa: (escolhas: Record<string, string>) =>
    dados(api.PUT('/api/editorial-skills/modelos-ia', { body: { escolhas } })),
  /** Pergunta ao `agy` e à API do Gemini: leva alguns segundos. */
  listarModelosDisponiveis: () => dados(api.GET('/api/editorial-skills/modelos-ia/disponiveis')),
};
