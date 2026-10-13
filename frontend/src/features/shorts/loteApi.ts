// D-564/D-908: o cliente HTTP do lote de publicação e da agenda que o distribui.
// Saiu de `shortsApi` quando ele chegou ao teto de tamanho (D-771).
import { api, dados, type Schema } from '@/shared/api';
import type { EnvioAssistido } from './shortsApi';

/** Um item do lote e a data que a janela do canal propôs para ele. */
export type LinhaDaAgenda = Schema<'LinhaDaAgenda'>;
export type AgendaParaEnvio = Schema<'ItemDaAgendaRequest'>[];

/** O que a tela escolhe antes de disparar o lote. */
export interface OpcoesDoLote extends EnvioAssistido {
  tiktokAssistido: boolean;
  instagramAssistido: boolean;
  republicar: boolean;
  /** D-908: uma data por item; quando vem, `agendarPara` é ignorado. */
  agenda?: AgendaParaEnvio;
}

export const loteApi = {
  /**
   * Dispara o lote. `alvos` vão prefixados por tipo ("short:uuid"), porque o
   * mesmo lote mistura o vertical do short e o 16:9 do corte.
   */
  criar: (alvos: string[], plataformas: string[], opcoes: OpcoesDoLote) =>
    dados(
      api.POST('/api/shorts/lote', {
        body: {
          alvos,
          plataformas,
          tiktok_assistido: opcoes.tiktokAssistido,
          instagram_assistido: opcoes.instagramAssistido,
          publicar_sozinho: opcoes.publicarSozinho,
          agendar_para: opcoes.agendarPara,
          republicar: opcoes.republicar,
          agenda: opcoes.agenda ?? [],
        },
      }),
    ),

  /** D-908: a data de cada item ANTES do clique, pela janela do canal. */
  preverAgenda: (alvos: string[], plataformas: string[]) =>
    dados(api.POST('/api/shorts/lote/agenda', { body: { alvos, plataformas } })),
};
