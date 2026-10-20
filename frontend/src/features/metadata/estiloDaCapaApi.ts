import { api, dados } from '@/shared/api';
import type { EstiloDaCapaTiktok } from '@/types/presets';

// D-933: o estilo da capa do TikTok do canal — ler, prever e gravar.

/** Sem corte, o modal abre pela tela de Canais e a prévia vai sem arte (D-947). */
export type Alvo = { corteId?: string };

/** D-938: o desenho da capa do canal — `palco` segue o palco, ou `atual`/`limpo` fixos. */
export type EstiloDaCapaDoCanal = 'palco' | 'atual' | 'limpo';

const corpo = ({ corteId }: Alvo, estilo: EstiloDaCapaTiktok) => ({
  corte_id: corteId,
  estilo,
});

export const estiloDaCapaApi = {
  obter: async ({ corteId }: Alvo) =>
    dados(
      api.GET('/api/capa-tiktok/estilo', {
        params: { query: corteId ? { corte_id: corteId } : {} },
      }),
    ),
  prever: async (alvo: Alvo, estilo: EstiloDaCapaTiktok) =>
    dados(api.POST('/api/capa-tiktok/estilo/previa', { body: corpo(alvo, estilo) })),
  gravar: async (alvo: Alvo, estilo: EstiloDaCapaTiktok) =>
    dados(api.PUT('/api/capa-tiktok/estilo', { body: corpo(alvo, estilo) })),
  /** D-938: o desenho da capa na tela de Canais, sem corte. */
  obterDoCanal: async () => dados(api.GET('/api/capa-tiktok/estilo/do-canal')),
  escolherDoCanal: async (estilo: EstiloDaCapaDoCanal) =>
    dados(api.PUT('/api/capa-tiktok/estilo/do-canal', { body: { estilo } })),
};
