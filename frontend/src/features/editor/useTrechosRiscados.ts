import { useToast } from '@/components/ui/toaster';
import { useDesfazerRodada, useRemoverDesvio, useRestaurarDesvio } from '@/features/editor/useCortes';
import type { Corte, Desvio } from '@/types/models';
import type { EditHistory } from './useEditHistory';

// D-1017 (RN-36): riscar, restaurar e desfazer a rodada. As três gravam na hora, mas o
// arraste de borda fica pendente até o Ctrl+S, com a lista INTEIRA de trechos. Salvar
// essa lista depois devolveria ao corte o que acabou de ser riscado, então a pendência
// é gravada antes.

export async function comDesviosSalvos(
  pendente: Partial<Corte>,
  salvar: (desvios: Desvio[]) => Promise<unknown>,
  limpar: (resto: Partial<Corte>) => void,
  acao: () => Promise<unknown>,
): Promise<void> {
  if (pendente.desvios) {
    await salvar(pendente.desvios);
    const { desvios: _gravados, ...resto } = pendente;
    limpar(resto);
  }
  await acao();
}

export interface TrechosRiscados {
  pendente: boolean;
  restaurando: boolean;
  riscar: (indice: number) => void;
  restaurar: (indice: number) => void;
  desfazerRodada: () => void;
}

export function useTrechosRiscados(
  corteId: string,
  editHistory: EditHistory<Partial<Corte>>,
  salvarDesvios: (desvios: Desvio[]) => Promise<unknown>,
): TrechosRiscados {
  const { notify } = useToast();
  const remover = useRemoverDesvio(corteId);
  const restaurar = useRestaurarDesvio(corteId);
  const desfazer = useDesfazerRodada(corteId);

  function executar(acao: () => Promise<unknown>, falha: string) {
    comDesviosSalvos(editHistory.getPresent(), salvarDesvios, editHistory.set, acao).catch(
      (erro: unknown) => {
        notify(erro instanceof Error ? erro.message : falha, { tone: 'error' });
      },
    );
  }

  return {
    pendente: remover.isPending,
    restaurando: restaurar.isPending || desfazer.isPending,
    riscar: (indice: number) =>
      executar(() => remover.mutateAsync(indice), 'Não foi possível riscar o trecho.'),
    restaurar: (indice: number) =>
      executar(() => restaurar.mutateAsync(indice), 'Não foi possível restaurar o trecho.'),
    desfazerRodada: () =>
      executar(() => desfazer.mutateAsync(), 'Não foi possível desfazer a rodada.'),
  };
}
