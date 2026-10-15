/**
 * D-934: o que o lote do YouTube longo manda ao upload, a partir do "Quando".
 *
 * O backend calcula a agenda (a mesma janela do canal dos shorts, RN-29); aqui
 * só se traduz a escolha da tela para o pedido do `bulk-youtube`: a data local
 * de cada linha vira UTC, que é o que o YouTube quer, e o corte que ficou sem
 * data fica FORA do lote — mandá-lo sem data seria publicá-lo na hora.
 */
import type { ModoDeQuando } from '@/features/shorts/agendaDoLote';
import type { LinhaDaAgenda } from '@/features/shorts/loteApi';

export interface PedidoDoLoteYoutube {
  corte_ids: string[];
  agendar: boolean;
  scheduled_dates: (string | null)[];
}

function emUtc(local: string): string | null {
  const quando = new Date(local);
  return Number.isNaN(quando.getTime()) ? null : quando.toISOString();
}

export function pedidoDoLoteYoutube(
  modo: ModoDeQuando,
  corteIds: string[],
  linhas: LinhaDaAgenda[],
  agendarPara: string,
): PedidoDoLoteYoutube {
  if (modo === 'agora') {
    return { corte_ids: corteIds, agendar: false, scheduled_dates: corteIds.map(() => null) };
  }

  const datas =
    modo === 'uma_data'
      ? new Map(corteIds.map((id) => [id, emUtc(agendarPara)]))
      : new Map(
          linhas
            .filter((linha) => linha.plataforma === 'youtube')
            .map((linha) => [linha.alvo_id, emUtc(linha.agendar_para)]),
        );
  const comData = corteIds.filter((id) => datas.get(id));
  return { corte_ids: comData, agendar: true, scheduled_dates: comData.map((id) => datas.get(id) ?? null) };
}
