import type { ProviderIA } from '@/lib/providerIa';
import { api, dados, type Schema } from '@/shared/api';
// D-447: cliente HTTP da avaliação automática da ESTRUTURA do bruto — a nota que
// a IA dá depois de ler o que sobrou com as emendas marcadas. Irmão HUMANO por
// corte: a avaliação do corte (D-419). Endpoints em routers/avaliacao_bruto.py.
// D-722: pelo cliente gerado; o veredito e a gravidade vêm do domínio.

export type TipoApontamento = Schema<'TipoApontamentoResponse'>;
export type AvaliacaoBruto = Schema<'AvaliacaoBrutoResponse'>;
export type ApontamentoBruto = AvaliacaoBruto['apontamentos'][number];
export type VereditoBruto = AvaliacaoBruto['veredito'];
export type GravidadeApontamento = ApontamentoBruto['gravidade'];

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const avaliacaoBrutoApi = {
  tipos: () => dados(api.GET('/api/avaliacao-bruto/tipos')).then((r) => r.tipos),

  /** Última avaliação do corte; `null` = nunca avaliado. */
  obter: (corteId: string) =>
    dados(api.GET('/api/avaliacao-bruto/corte/{corte_id}', doCorte(corteId))).then((r) => r.avaliacao),

  /** A série completa do corte, da mais recente para a mais antiga. */
  historico: (corteId: string) =>
    dados(api.GET('/api/avaliacao-bruto/corte/{corte_id}/historico', doCorte(corteId))).then(
      (r) => r.avaliacoes,
    ),

  /** A última avaliação de cada corte da live. */
  doProjeto: (projetoId: string) =>
    dados(
      api.GET('/api/avaliacao-bruto/projeto/{projeto_id}', { params: { path: { projeto_id: projetoId } } }),
    ).then((r) => r.avaliacoes),

  /** Reavalia o bruto atual sem regerar o vídeo (o normal é rodar sozinha). */
  reavaliar: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(
      api.POST('/api/avaliacao-bruto/corte/{corte_id}', {
        params: { path: { corte_id: corteId }, query: { provider } },
      }),
    ).then((r) => r.avaliacao),
};
