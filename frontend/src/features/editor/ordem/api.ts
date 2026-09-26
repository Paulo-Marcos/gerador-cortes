import type { Corte } from '@/types/models';
import { api, dados, type Schema } from '@/shared/api';
// D-448: cliente HTTP do desvio EXPLÍCITO da ordem cronológica dos cortes.
// A ordem padrão (por tempo) não tem endpoint: o backend a recalcula a cada
// operação que cria ou move corte. O que existe aqui é o pin — e o desfazer
// dele. Endpoints em routers/ordem_cortes.py. D-722: pelo cliente gerado.

/** `Corte` + o pin do D-448. Extensão local porque `types/models.ts` está sob
 *  lock; o backend já devolve o campo em toda rota de corte. */
export type CorteComPin = Corte & { posicao_fixada?: number | null };

/** Um corte está fora da ordem cronológica só quando foi fixado na mão. */
export function estaFixado(corte: CorteComPin): boolean {
  return corte.posicao_fixada != null;
}

// O cache de cortes ainda usa o `Corte` escrito à mão (types/models.ts), que
// diverge do CorteResponse do contrato — declara, por exemplo, campos do YouTube
// que nenhuma rota de corte manda. A listagem de lib/api.ts entra no cache pelo
// mesmo atalho (o antigo `request<Corte[]>`); os dois saem juntos quando o
// `Corte` passar a ser o do contrato. Até lá o atalho mora só aqui.
const paraOCacheDeCortes = (cortes: Schema<'CorteResponse'>[]) =>
  cortes as unknown as CorteComPin[];

export const ordemCortesApi = {
  /** Solta todos os pins da live e devolve a lista à ordem do tempo. */
  normalizar: (projetoId: string): Promise<CorteComPin[]> =>
    dados(
      api.POST('/api/ordem-cortes/projeto/{projeto_id}/normalizar', {
        params: { path: { projeto_id: projetoId } },
      }),
    ).then(paraOCacheDeCortes),

  /** Fixa o corte numa posição (1-based); `null` solta e devolve ao tempo. */
  fixarPosicao: (corteId: string, posicao: number | null): Promise<CorteComPin[]> =>
    dados(
      api.PUT('/api/ordem-cortes/corte/{corte_id}/posicao', {
        params: { path: { corte_id: corteId } },
        body: { posicao },
      }),
    ).then(paraOCacheDeCortes),
};
