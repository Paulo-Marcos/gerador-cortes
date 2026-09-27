import { api, dados, type Schema } from '@/shared/api';
import type { ProviderIA } from '@/lib/providerIa';
import type { DecisaoSegmentoDetectado } from '@/types/models';

// O corte na edição: listar, criar, abrir, editar, aprovar, excluir, dividir,
// juntar, reordenar, os trechos a remover e os segmentos detectados no bruto.
// D-722: saiu de lib/api.ts, sobre o cliente gerado. O `Corte` da tela é o
// CorteResponse, então as respostas chegam sem conversão.

export type AtualizarCorteRequest = Schema<'AtualizarCorteRequest'>;
export type AdicionarDesvioRequest = Schema<'AdicionarDesvioRequest'>;
export type CriarCorteManualRequest = Schema<'CriarCorteManualRequest'>;

const doProjeto = (projetoId: string) => ({ params: { path: { projeto_id: projetoId } } });
const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const cortesApi = {
  listarCortes: (projetoId: string) =>
    dados(api.GET('/api/cortes/projeto/{projeto_id}', doProjeto(projetoId))),

  // F-056: cria um corte a partir de início e fim (HMS); o backend sincroniza a
  // transcrição.
  criarCorteManual: (projetoId: string, body: CriarCorteManualRequest) =>
    dados(api.POST('/api/cortes/projeto/{projeto_id}/manual', { ...doProjeto(projetoId), body })),

  // F-057: renumera os cortes na ordem informada; espera a lista completa de ids.
  reordenarCortes: (projetoId: string, cortesIds: string[]) =>
    dados(
      api.POST('/api/cortes/projeto/{projeto_id}/reordenar', {
        ...doProjeto(projetoId),
        body: { cortes_ids: cortesIds },
      }),
    ),

  // F-061: divide no ponto do player. O original encolhe e o novo herda os
  // trechos a remover da metade direita. Devolve [original, novo].
  dividirCorte: (corteId: string, body: Schema<'DividirCorteRequest'>) =>
    dados(api.POST('/api/cortes/{corte_id}/dividir', { ...doCorte(corteId), body })),

  // D-575: funde com o vizinho seguinte (ou com `outro_corte_id`). Sobrevive o
  // que começa antes, herdando bordas, trechos, cenas, layout e shorts do outro.
  juntarCortes: (corteId: string, body: Schema<'JuntarCortesRequest'> = {}) =>
    dados(api.POST('/api/cortes/{corte_id}/juntar', { ...doCorte(corteId), body })),

  obterCorte: (corteId: string) => dados(api.GET('/api/cortes/{corte_id}', doCorte(corteId))),

  atualizarCorte: (corteId: string, patch: AtualizarCorteRequest) =>
    dados(api.PATCH('/api/cortes/{corte_id}', { ...doCorte(corteId), body: patch })),

  aprovarCorte: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/aprovar', doCorte(corteId))),

  deletarCorte: (corteId: string) => dados(api.DELETE('/api/cortes/{corte_id}', doCorte(corteId))),

  abrirPastaCorte: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/abrir-pasta', doCorte(corteId))),

  // F-054: detecta mudanças de cena no bruto; roda em segundo plano.
  detectarSegmentos: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/detectar-segmentos', doCorte(corteId))),

  // F-054: rejeita ou aceita um segmento sugerido; aceitar materializa a região.
  decidirSegmentoDetectado: (corteId: string, indice: number, decisao: DecisaoSegmentoDetectado) =>
    dados(
      api.PATCH('/api/cortes/{corte_id}/segmentos-detectados/{indice}', {
        params: { path: { corte_id: corteId, indice } },
        body: { decisao },
      }),
    ),

  // ─── Trechos a remover ─────────────────────────────────────────────
  analisarDesviosCorte: (corteId: string, limparAnteriores: boolean) =>
    dados(
      api.POST('/api/cortes/{corte_id}/analisar-desvios', {
        params: { path: { corte_id: corteId }, query: { limpar_anteriores: limparAnteriores } },
      }),
    ),

  // D-304: a mesma geração de trechos para TODOS os cortes do projeto, um a um,
  // em segundo plano. O backend não expõe o progresso.
  analisarDesviosTodos: (projetoId: string, provider: ProviderIA = 'claude') =>
    dados(
      api.POST('/api/cortes/projeto/{projeto_id}/analisar-desvios-todos', {
        params: { path: { projeto_id: projetoId }, query: { provider } },
      }),
    ),

  // O prompt para rodar a análise de trechos numa IA de fora (modo manual).
  obterPromptDesvios: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/desvios/prompt', doCorte(corteId))),

  // Importa o JSON que a IA de fora devolveu: { trechos: [...] }.
  importarDesvios: (corteId: string, trechos: unknown[]) =>
    dados(
      api.POST('/api/cortes/{corte_id}/desvios/importar', {
        ...doCorte(corteId),
        body: { trechos },
      }),
    ),

  adicionarDesvio: (corteId: string, body: AdicionarDesvioRequest) =>
    dados(api.POST('/api/cortes/{corte_id}/adicionar-desvio', { ...doCorte(corteId), body })),

  removerDesvio: (corteId: string, desvioIndex: number) =>
    dados(
      api.POST('/api/cortes/{corte_id}/remover-desvio', {
        ...doCorte(corteId),
        body: { desvio_index: desvioIndex },
      }),
    ),

  sincronizarTranscricao: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/sincronizar-transcricao', doCorte(corteId))),

  sincronizarPosProducao: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/sincronizar-pos-producao', doCorte(corteId))),
};
