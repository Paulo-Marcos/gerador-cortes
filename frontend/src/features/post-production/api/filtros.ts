import { api, dados, type Schema } from '@/shared/api';

// Filtros de cinema do render e as versões do corte com cada filtro aplicado
// (multiversão, para comparar lado a lado). D-722: saiu de lib/api.ts para a
// feature, sobre o cliente gerado. A revisão final e as configurações também
// listam os filtros, e importam daqui.

export type FiltroExport = Schema<'FiltroExport'>;
export type VersaoExport = Schema<'VersaoExport'>;

const doCorte = (corteId: string) => ({ path: { corte_id: corteId } });

export const filtrosApi = {
  listarFiltros: () => dados(api.GET('/api/export/filtros')),

  listarVersoes: (corteId: string) =>
    dados(api.GET('/api/export/corte/{corte_id}/versoes', { params: doCorte(corteId) })),

  /** Gera as versões em segundo plano; `filtros` null = todos os do catálogo. */
  processarMultiversion: (
    corteId: string,
    preview = true,
    previewSegundos = 10,
    filtros: string[] | null = null,
  ) =>
    dados(
      api.POST('/api/export/corte/{corte_id}/processar-multiversion', {
        params: { ...doCorte(corteId), query: { preview, preview_segundos: previewSegundos } },
        body: filtros ? { filtros } : {},
      }),
    ),
};
