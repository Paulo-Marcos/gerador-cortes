import { api, dados, type Schema } from '@/shared/api';

// D-286: diarização de falantes (canal vs. reagidos). D-722: saiu de lib/api.ts
// — e do fetch escrito à mão no hook, para a diarização por corte (D-360) —
// para a feature, sobre o cliente gerado.

export type FalanteInfo = Schema<'FalanteInfo'>;
/** Mapa {speaker_id -> info}, ex.: { "SPEAKER_00": { nome: "Pedro", is_canal: true } }. */
export type FalantesMap = Record<string, FalanteInfo>;
/** `ok=false` traz só o `motivo`; `ok=true`, os falantes e o canal. */
export type DiarizarResponse = Schema<'DiarizacaoResponse'>;
export type FalantesResponse = Schema<'FalantesResponse'>;

const doProjeto = (projetoId: string) => ({ params: { path: { projeto_id: projetoId } } });

export const diarizacaoApi = {
  diarizarProjeto: (projetoId: string) =>
    dados(api.POST('/api/diarizacao/projeto/{projeto_id}/diarizar', doProjeto(projetoId))),

  /** Diariza SÓ a janela de um corte (D-360). */
  diarizarCorte: (corteId: string) =>
    dados(
      api.POST('/api/diarizacao/corte/{corte_id}/diarizar', {
        params: { path: { corte_id: corteId } },
      }),
    ),

  obterFalantes: (projetoId: string) =>
    dados(api.GET('/api/diarizacao/projeto/{projeto_id}/falantes', doProjeto(projetoId))),

  atualizarFalantes: (projetoId: string, falantes: FalantesMap) =>
    dados(
      api.PUT('/api/diarizacao/projeto/{projeto_id}/falantes', {
        ...doProjeto(projetoId),
        body: { falantes },
      }),
    ),
};
