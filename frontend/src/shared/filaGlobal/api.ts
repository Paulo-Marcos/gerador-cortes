import { api, dados } from '@/shared/api';

// A fila global de jobs (D-417): o inventário de todo trabalho pesado — bruto,
// pós, render, YouTube, consultas de IA — e o cancelamento de um deles (D-426).
// Mora em shared/ porque é da aplicação inteira, não de uma feature: a casca a
// mostra em qualquer tela. D-722: saiu de lib/api.ts, sobre o cliente gerado.

export const filaGlobalApi = {
  filaGlobal: () => dados(api.GET('/api/export/fila-global')),

  /** D-426: interrompe um job da fila sem derrubar a aplicação. */
  cancelarJob: (jobId: string) =>
    dados(api.POST('/api/export/fila-global/cancelar', { body: { job_id: jobId } })),
};
