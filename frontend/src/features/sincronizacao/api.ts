import { api, dados } from '@/shared/api';

// O que roda bate com o que está no disco (D-491) e o que falta nesta máquina
// (D-627). D-722: pelo cliente gerado, no lugar do fetch direto das telas.

export const sincronizacaoApi = {
  estado: () => dados(api.GET('/api/sincronizacao')),

  ambiente: () => dados(api.GET('/api/sincronizacao/ambiente')),
};
