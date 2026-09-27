import { api, dados } from '@/shared/api';

// D-576: a ordem de exibição dos blocos do corte. Toda operação devolve o
// arranjo inteiro recalculado — o cliente não deduz estado, só desenha. D-722:
// saiu de lib/api.ts, sobre o cliente gerado.

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const arranjoApi = {
  obterArranjo: (corteId: string) => dados(api.GET('/api/cortes/{corte_id}/arranjo', doCorte(corteId))),

  dividirBloco: (corteId: string, body: { ponto_seg: number }) =>
    dados(api.POST('/api/cortes/{corte_id}/arranjo/dividir', { ...doCorte(corteId), body })),

  moverBloco: (corteId: string, body: { de_indice: number; para_indice: number }) =>
    dados(api.POST('/api/cortes/{corte_id}/arranjo/mover', { ...doCorte(corteId), body })),

  fundirBloco: (corteId: string, body: { indice: number }) =>
    dados(api.POST('/api/cortes/{corte_id}/arranjo/fundir', { ...doCorte(corteId), body })),

  restaurarArranjo: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/arranjo/restaurar', doCorte(corteId))),
};
