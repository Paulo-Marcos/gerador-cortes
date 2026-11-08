import { api, dados, type Schema } from '@/shared/api';
import type { CenasRemotionPayload } from '@/types/models';

// As cenas Remotion do corte: gerar, importar a resposta de uma IA de fora,
// validar e o prompt do modo manual. D-722: saiu de lib/api.ts, sobre o cliente
// gerado. A forma de cada cena é o contrato da cena (D-725); até lá ela passa
// como objeto.

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const cenasApi = {
  gerarCenasRemotion: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/gerar-cenas-remotion', doCorte(corteId))),

  importarCenasRemotion: (corteId: string, payload: CenasRemotionPayload) =>
    dados(
      api.POST('/api/cortes/{corte_id}/cenas-remotion/importar', {
        ...doCorte(corteId),
        body: payload as unknown as Schema<'ImportarCenasRequest'>,
      }),
    ),

  validarCenasRemotion: (corteId: string, validado = true) =>
    dados(
      api.POST('/api/cortes/{corte_id}/cenas-remotion/validar', { ...doCorte(corteId), body: { validado } }),
    ),

  /** Busca os retratos das fichas biográficas das cenas e grava o que achar. */
  preencherRetratos: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/cenas-remotion/retratos', doCorte(corteId))),

  /** Os avisos de origem das cenas gravadas (D-1018): só avisam, nada muda. */
  conferirOrigem: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/cenas-remotion/conferencia', doCorte(corteId))),

  /** A rodada atual das cenas, a anterior e o que entrou, saiu e mudou (D-1071). */
  compararRodadas: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/cenas-remotion/rodadas', doCorte(corteId))),

  /** Troca as rodadas de lugar: desfaz, e de novo refaz. `versao` é a da comparação vista. */
  desfazerRodada: (corteId: string, versao: string) =>
    dados(
      api.POST('/api/cortes/{corte_id}/cenas-remotion/rodadas/desfazer', { ...doCorte(corteId), body: { versao } }),
    ),

  /** D-1074: grava a cena ajustada pela IA; recusa se o plano mudou desde o pedido. */
  aceitarAjuste: (corteId: string, body: Schema<'AceitarAjusteRequest'>) =>
    dados(api.POST('/api/cortes/{corte_id}/cenas-remotion/ajuste/aceitar', { ...doCorte(corteId), body })),

  obterPromptCenasRemotion: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/cenas-remotion/prompt', doCorte(corteId))),
};
