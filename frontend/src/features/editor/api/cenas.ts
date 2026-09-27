import { api, dados, type Schema } from '@/shared/api';
import type { CenasRemotionPayload } from '@/types/models';
import { paraOCorteDaTela } from './cortes';

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

  validarCenasRemotion: async (corteId: string, validado = true) =>
    paraOCorteDaTela(
      await dados(
        api.POST('/api/cortes/{corte_id}/cenas-remotion/validar', { ...doCorte(corteId), body: { validado } }),
      ),
    ),

  obterPromptCenasRemotion: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/cenas-remotion/prompt', doCorte(corteId))),
};
