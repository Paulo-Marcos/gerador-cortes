import { api, dados, type Schema } from '@/shared/api';
// D-419: cliente HTTP da avaliação de qualidade POR CORTE, colhida quando o
// editor manda gerar o bruto pela 1ª vez. Irmão por LIVE: o voto de qualidade
// (D-372). Endpoints em routers/avaliacao_cortes.py. D-722: pelo cliente gerado.

/** Ressalva do vocabulário fechado do backend — o front não duplica a lista. */
export type MotivoAvaliacao = Schema<'MotivoAvaliacaoResponse'>;
/** A avaliação do corte; `voto` null = ainda não avaliado. */
export type AvaliacaoCorte = Schema<'AvaliacaoCorteResponse'>;
export type AvaliacaoCortePayload = Schema<'AvaliacaoCorteRequest'>;

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const avaliacaoCorteApi = {
  motivos: () => dados(api.GET('/api/avaliacao-cortes/motivos')).then((r) => r.motivos),

  obter: (corteId: string) => dados(api.GET('/api/avaliacao-cortes/corte/{corte_id}', doCorte(corteId))),

  salvar: (corteId: string, payload: AvaliacaoCortePayload) =>
    dados(api.PUT('/api/avaliacao-cortes/corte/{corte_id}', { ...doCorte(corteId), body: payload })),
};
