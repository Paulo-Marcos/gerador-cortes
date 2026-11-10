import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/toaster';
import {
  useDecidirOsSilencios,
  useDesfazerRodada,
  useRemoverDesvio,
  useRestaurarDesvio,
  useVoltarABordaDaIa,
  type DecisaoDoSilencio,
} from '@/features/editor/useCortes';
import type { Corte, Desvio } from '@/types/models';
import type { EditHistory } from './useEditHistory';

// D-1017 (RN-36): riscar, restaurar, desfazer a rodada e (D-1089) voltar à borda da IA
// gravam na hora, mas o arraste de borda fica pendente até o Ctrl+S, com a lista
// INTEIRA de trechos. Salvar
// essa lista depois devolveria ao corte o que acabou de ser riscado, então a pendência
// é gravada antes. E o histórico recomeça, como ao salvar: com o Ctrl+Z, a lista velha
// voltaria a ser pendente.
export async function comDesviosSalvos(
  historico: Pick<EditHistory<Partial<Corte>>, 'getPresent' | 'reset'>,
  salvar: (desvios: Desvio[]) => Promise<unknown>,
  acao: () => Promise<unknown>,
): Promise<void> {
  const pendente = historico.getPresent();
  if (pendente.desvios) {
    await salvar(pendente.desvios);
    const { desvios: _gravados, ...resto } = pendente;
    historico.reset(resto);
  }
  await acao();
}

/**
 * As ações usam o índice na lista: duas ao mesmo tempo riscariam a marca seguinte.
 * O clique que chega com outra em voo é ignorado.
 */
export function umaDeCadaVez(aoMudar: (ocupado: boolean) => void) {
  let ocupado = false;
  return async (acao: () => Promise<unknown>): Promise<void> => {
    if (ocupado) return;
    ocupado = true;
    aoMudar(true);
    try {
      await acao();
    } finally {
      ocupado = false;
      aoMudar(false);
    }
  };
}

export interface TrechosRiscados {
  ocupado: boolean;
  riscar: (indice: number) => void;
  restaurar: (indice: number) => void;
  desfazerRodada: () => void;
  /** D-1089 (P10): o trecho `indice` volta à borda da IA, e à rodada. */
  voltarABordaDaIa: (indice: number) => void;
  /** D-1093 (P9): tirar ou manter todos os silêncios do app, de uma vez. */
  decidirOsSilencios: (decisao: DecisaoDoSilencio) => void;
}

export function useTrechosRiscados(
  corteId: string,
  editHistory: EditHistory<Partial<Corte>>,
  salvarDesvios: (desvios: Desvio[]) => Promise<unknown>,
  aoMudarALista: () => void,
): TrechosRiscados {
  const { notify } = useToast();
  const remover = useRemoverDesvio(corteId);
  const restaurar = useRestaurarDesvio(corteId);
  const desfazer = useDesfazerRodada(corteId);
  const voltar = useVoltarABordaDaIa(corteId);
  const silencios = useDecidirOsSilencios(corteId);
  const [ocupado, setOcupado] = useState(false);
  const fila = useRef(umaDeCadaVez(setOcupado));

  function executar(acao: () => Promise<unknown>, falha: string) {
    fila
      .current(async () => {
        await comDesviosSalvos(editHistory, salvarDesvios, acao);
        // A seleção é um índice: com a lista mudada, o Delete riscaria outra marca.
        aoMudarALista();
      })
      .catch((erro: unknown) => {
        notify(erro instanceof Error ? erro.message : falha, { tone: 'error' });
      });
  }

  return {
    ocupado,
    riscar: (indice: number) =>
      executar(() => remover.mutateAsync(indice), 'Não foi possível riscar o trecho.'),
    restaurar: (indice: number) =>
      executar(() => restaurar.mutateAsync(indice), 'Não foi possível restaurar o trecho.'),
    desfazerRodada: () =>
      executar(() => desfazer.mutateAsync(), 'Não foi possível desfazer a rodada.'),
    voltarABordaDaIa: (indice: number) =>
      executar(() => voltar.mutateAsync(indice), 'Não foi possível voltar à borda da IA.'),
    decidirOsSilencios: (decisao: DecisaoDoSilencio) =>
      executar(() => silencios.mutateAsync(decisao), 'Não foi possível mudar os silêncios.'),
  };
}
