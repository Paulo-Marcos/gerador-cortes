import { api, dados } from '@/shared/api';

// O render do corte: disparar o pipeline, acompanhar a situação e abrir no
// Remotion Studio. D-722: saiu de lib/api.ts, sobre o cliente gerado.

export interface OpcoesDoRender {
  startFrom?: 'auto' | 'grade' | 'overlays' | 'overlays_continuar' | 'render_final';
  // D-064: render granular — para após esta fase (parcial, não finaliza o
  // corte). Omitido = roda até o render final.
  pararEm?: 'grade' | 'overlays' | 'render_final';
  // D-064: quando informado, controla o reaproveitamento de overlays
  // (continuar vs. refazer do zero). Ausente, deriva do `startFrom`.
  continuar?: boolean;
  filtro?: string;
}

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const renderApi = {
  renderizarRemotion: (corteId: string, options: OpcoesDoRender = {}) => {
    const startFromUi = options.startFrom ?? 'auto';
    const isContinuarFase2 = startFromUi === 'overlays_continuar';
    // I-023: NUNCA enviar fallback de filtro. Sem filtro de teste do caller, o
    // backend resolve `filtro=null` para `AppSettings.filtro_global_padrao`
    // (fonte única, em Ajustes). O bug antigo ("renderiza sempre cinematic_iii
    // completo") era exatamente um fallback `'cinematic_iii'` aqui.
    const payload: {
      filtro?: string;
      continuar: boolean;
      start_from: string;
      parar_em?: string;
    } = {
      continuar: options.continuar ?? (startFromUi === 'auto' || isContinuarFase2),
      start_from: isContinuarFase2 ? 'overlays' : startFromUi,
    };
    if (options.pararEm) payload.parar_em = options.pararEm;
    if (options.filtro) payload.filtro = options.filtro;
    return dados(api.POST('/api/cortes/{corte_id}/renderizar-pipeline', { ...doCorte(corteId), body: payload }));
  },

  obterPipelineStatus: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/pipeline-status', doCorte(corteId))),

  obterRemotionStudioUrl: (corteId: string) =>
    dados(api.GET('/api/cortes/{corte_id}/remotion-studio-url', doCorte(corteId))),
};
