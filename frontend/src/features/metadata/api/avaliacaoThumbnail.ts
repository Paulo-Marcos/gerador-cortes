import { api, dados, type Schema } from '@/shared/api';

// D-066: histórico de avaliações do par prompt+imagem de thumbnail, por corte.
// D-722: saiu de lib/api.ts para a feature, sobre o cliente gerado.

/** O vocabulário do veredito rápido — o backend recusa (400) o que estiver fora. */
export type VeredictoThumbnail = 'otimo' | 'bom' | 'regular' | 'ruim';
export type AvaliacaoThumbnail = Schema<'AvaliacaoThumbnailResponse'>;
export type AvaliacaoThumbnailHistorico = Schema<'AvaliacoesThumbnailResponse'>;
export type RegistrarAvaliacaoThumbnailBody = Schema<'RegistrarAvaliacaoRequest'> & {
  veredito: VeredictoThumbnail;
};

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const avaliacaoThumbnailApi = {
  registrar: (corteId: string, body: RegistrarAvaliacaoThumbnailBody) =>
    dados(api.POST('/api/avaliacoes-thumbnail/corte/{corte_id}', { ...doCorte(corteId), body })),

  listar: (corteId: string) =>
    dados(api.GET('/api/avaliacoes-thumbnail/corte/{corte_id}', doCorte(corteId))),
};
