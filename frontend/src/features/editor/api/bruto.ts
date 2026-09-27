import { api, dados } from '@/shared/api';

// O vídeo bruto do corte: gerar (cortar da live, tirando os trechos), o status
// e os passos da geração. D-722: saiu de lib/api.ts, sobre o cliente gerado.

/** D-160: opt-ins da regeração. Só valem quando o corte já tem bruto; na 1ª
 *  geração o backend força a cadeia completa e os ignora. */
export interface GerarBrutoOpcoes {
  refazer_transcricao?: boolean;
  refazer_cenas?: boolean;
}

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const brutoApi = {
  // Dispara em segundo plano; o progresso vem por statusClipBruto. Na regeração
  // o padrão é só o bruto — o mesmo `false` que o backend assume sem corpo.
  cortarClipBruto: (corteId: string, opts: GerarBrutoOpcoes = {}) =>
    dados(
      api.POST('/api/cortes/{corte_id}/gerar-bruto', {
        ...doCorte(corteId),
        body: { refazer_transcricao: false, refazer_cenas: false, ...opts },
      }),
    ),

  statusClipBruto: (corteId: string) =>
    dados(api.GET('/api/export/corte/{corte_id}/cortar/status', doCorte(corteId))),

  // F-038: os passos do gerar/regerar bruto, para o acompanhamento.
  brutoProgress: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/bruto-progress', doCorte(corteId))),
};
