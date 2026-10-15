import { api, dados } from '@/shared/api';
import type { EstiloDaCapaTiktok } from '@/types/presets';

// D-933: o estilo da capa do TikTok do canal — ler, prever e gravar.

export type Alvo = { projetoId: string; corteId: string };

const corpo = ({ projetoId, corteId }: Alvo, estilo: EstiloDaCapaTiktok) => ({
  projeto_id: projetoId,
  corte_id: corteId,
  estilo,
});

export const estiloDaCapaApi = {
  obter: async ({ projetoId, corteId }: Alvo) =>
    dados(
      api.GET('/api/capa-tiktok/estilo', {
        params: { query: { projeto_id: projetoId, corte_id: corteId } },
      }),
    ),
  prever: async (alvo: Alvo, estilo: EstiloDaCapaTiktok) =>
    dados(api.POST('/api/capa-tiktok/estilo/previa', { body: corpo(alvo, estilo) })),
  gravar: async (alvo: Alvo, estilo: EstiloDaCapaTiktok) =>
    dados(api.PUT('/api/capa-tiktok/estilo', { body: corpo(alvo, estilo) })),
};
