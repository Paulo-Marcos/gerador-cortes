import { useValidarCenasRemotion } from '@/features/editor/useCenas';
import { useCenasEmGeracao } from '@/features/editor/useGeracoesDaIa';
import { useToast } from '@/components/ui/toaster';

/**
 * D-1164 (DIRECAO §5): o primário da barra da Pós é "Validar plano" enquanto o plano não foi
 * validado. O clique é o mesmo do botão do painel de cenas: não valida com cenas em geração nem
 * com edição não salva (o painel avisa o mesmo), e diz por quê em vez de ficar mudo.
 */
export function useValidarPlanoDaPos(corteId: string, projetoId: string, cenasNaoSalvas: boolean) {
  const { notify } = useToast();
  const validar = useValidarCenasRemotion(corteId, projetoId);
  const { emGeracao } = useCenasEmGeracao(corteId, projetoId);

  const validarOPlano = () => {
    if (emGeracao) return notify('Espere as cenas terminarem de ser geradas.', { tone: 'info' });
    if (cenasNaoSalvas) return notify('Salve as cenas antes de validar (Ctrl+S).', { tone: 'info' });
    validar.mutate(true, {
      onSuccess: () => notify('Plano de cenas validado.', { tone: 'success' }),
      onError: (erro) =>
        notify(erro instanceof Error ? erro.message : 'Erro ao validar o plano de cenas.', { tone: 'error' }),
    });
  };

  return { validarOPlano, validando: validar.isPending };
}
