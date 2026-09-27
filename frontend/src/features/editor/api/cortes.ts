import { api, dados, type Schema } from '@/shared/api';
import type { ProviderIA } from '@/lib/providerIa';
import type { Corte, DecisaoSegmentoDetectado } from '@/types/models';

// O corte na edição: listar, criar, abrir, editar, aprovar, excluir, dividir,
// juntar, reordenar, os trechos a remover e os segmentos detectados no bruto.
// D-722: saiu de lib/api.ts, sobre o cliente gerado.

type CorteDoContrato = Schema<'CorteResponse'>;

// A tela ainda fala do corte pelo `Corte` de types/models, que descreve as
// listas internas (trechos, transcrição, segmentos) que o contrato leva como
// listas livres — e marca `is_leitura` como booleano, que o backend guarda 0/1
// e aceita dos dois jeitos. As conversões, nos dois sentidos, moram só aqui (a
// ordem dos cortes usa a mesma) até o CorteResponse tipar essas listas e o
// `Corte` virar apelido dele.
export const paraOCorteDaTela = (corte: CorteDoContrato) => corte as unknown as Corte;
export const paraOsCortesDaTela = (cortes: CorteDoContrato[]) => cortes.map(paraOCorteDaTela);
const paraOCorpoDoContrato = (patch: Partial<Corte>) => patch as unknown as AtualizarCorteRequest;

export type AtualizarCorteRequest = Schema<'AtualizarCorteRequest'>;
export type AdicionarDesvioRequest = Schema<'AdicionarDesvioRequest'>;
export type CriarCorteManualRequest = Schema<'CriarCorteManualRequest'>;

const doProjeto = (projetoId: string) => ({ params: { path: { projeto_id: projetoId } } });
const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const cortesApi = {
  listarCortes: async (projetoId: string) =>
    paraOsCortesDaTela(await dados(api.GET('/api/cortes/projeto/{projeto_id}', doProjeto(projetoId)))),

  // F-056: cria um corte a partir de início e fim (HMS); o backend sincroniza a
  // transcrição.
  criarCorteManual: async (projetoId: string, body: CriarCorteManualRequest) =>
    paraOCorteDaTela(
      await dados(api.POST('/api/cortes/projeto/{projeto_id}/manual', { ...doProjeto(projetoId), body })),
    ),

  // F-057: renumera os cortes na ordem informada; espera a lista completa de ids.
  reordenarCortes: async (projetoId: string, cortesIds: string[]) =>
    paraOsCortesDaTela(
      await dados(
        api.POST('/api/cortes/projeto/{projeto_id}/reordenar', {
          ...doProjeto(projetoId),
          body: { cortes_ids: cortesIds },
        }),
      ),
    ),

  // F-061: divide no ponto do player. O original encolhe e o novo herda os
  // trechos a remover da metade direita. Devolve [original, novo].
  dividirCorte: async (corteId: string, body: Schema<'DividirCorteRequest'>) =>
    paraOsCortesDaTela(await dados(api.POST('/api/cortes/{corte_id}/dividir', { ...doCorte(corteId), body }))),

  // D-575: funde com o vizinho seguinte (ou com `outro_corte_id`). Sobrevive o
  // que começa antes, herdando bordas, trechos, cenas, layout e shorts do outro.
  juntarCortes: async (corteId: string, body: Schema<'JuntarCortesRequest'> = {}) =>
    paraOCorteDaTela(await dados(api.POST('/api/cortes/{corte_id}/juntar', { ...doCorte(corteId), body }))),

  obterCorte: async (corteId: string) =>
    paraOCorteDaTela(await dados(api.GET('/api/cortes/{corte_id}', doCorte(corteId)))),

  atualizarCorte: async (corteId: string, patch: Partial<Corte>) =>
    paraOCorteDaTela(
      await dados(
        api.PATCH('/api/cortes/{corte_id}', { ...doCorte(corteId), body: paraOCorpoDoContrato(patch) }),
      ),
    ),

  aprovarCorte: (corteId: string) => dados(api.POST('/api/cortes/{corte_id}/aprovar', doCorte(corteId))),

  deletarCorte: (corteId: string) => dados(api.DELETE('/api/cortes/{corte_id}', doCorte(corteId))),

  abrirPastaCorte: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/abrir-pasta', doCorte(corteId))),

  // F-054: detecta mudanças de cena no bruto; roda em segundo plano.
  detectarSegmentos: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/detectar-segmentos', doCorte(corteId))),

  // F-054: rejeita ou aceita um segmento sugerido; aceitar materializa a região.
  decidirSegmentoDetectado: async (corteId: string, indice: number, decisao: DecisaoSegmentoDetectado) =>
    paraOCorteDaTela(
      await dados(
        api.PATCH('/api/cortes/{corte_id}/segmentos-detectados/{indice}', {
          params: { path: { corte_id: corteId, indice } },
          body: { decisao },
        }),
      ),
    ),

  // ─── Trechos a remover ─────────────────────────────────────────────
  analisarDesviosCorte: async (corteId: string, limparAnteriores: boolean) =>
    paraOCorteDaTela(
      await dados(
        api.POST('/api/cortes/{corte_id}/analisar-desvios', {
          params: { path: { corte_id: corteId }, query: { limpar_anteriores: limparAnteriores } },
        }),
      ),
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
  importarDesvios: async (corteId: string, trechos: unknown[]) =>
    paraOCorteDaTela(
      await dados(api.POST('/api/cortes/{corte_id}/desvios/importar', { ...doCorte(corteId), body: { trechos } })),
    ),

  adicionarDesvio: async (corteId: string, body: AdicionarDesvioRequest) =>
    paraOCorteDaTela(
      await dados(api.POST('/api/cortes/{corte_id}/adicionar-desvio', { ...doCorte(corteId), body })),
    ),

  removerDesvio: async (corteId: string, desvioIndex: number) =>
    paraOCorteDaTela(
      await dados(
        api.POST('/api/cortes/{corte_id}/remover-desvio', {
          ...doCorte(corteId),
          body: { desvio_index: desvioIndex },
        }),
      ),
    ),

  sincronizarTranscricao: async (corteId: string) =>
    paraOCorteDaTela(await dados(api.POST('/api/cortes/{corte_id}/sincronizar-transcricao', doCorte(corteId)))),

  sincronizarPosProducao: (corteId: string) =>
    dados(api.POST('/api/cortes/{corte_id}/sincronizar-pos-producao', doCorte(corteId))),
};
