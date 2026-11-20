import { useValidarCenasRemotion } from '@/features/editor/useCenas';
import { useCenasEmGeracao } from '@/features/editor/useGeracoesDaIa';
import { useToast } from '@/components/ui/toaster';

export type DecisaoDeValidar = 'esperar-geracao' | 'salvar-antes' | 'ja-validando' | 'validar';

/** O que o clique em "Validar plano" faz: valida só com o plano salvo, parado e sem outra validação em voo. */
export function decidirValidacao(e: { emGeracao: boolean; cenasNaoSalvas: boolean; validando: boolean }): DecisaoDeValidar {
  if (e.emGeracao) return 'esperar-geracao';
  if (e.cenasNaoSalvas) return 'salvar-antes';
  if (e.validando) return 'ja-validando';
  return 'validar';
}

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
    const decisao = decidirValidacao({ emGeracao, cenasNaoSalvas, validando: validar.isPending });
    if (decisao === 'esperar-geracao') return notify('Espere as cenas terminarem de ser geradas.', { tone: 'info' });
    if (decisao === 'salvar-antes') return notify('Salve as cenas antes de validar (Ctrl+S).', { tone: 'info' });
    if (decisao === 'ja-validando') return;
    validar.mutate(true, {
      onSuccess: () => notify('Plano de cenas validado.', { tone: 'success' }),
      onError: (erro) =>
        notify(erro instanceof Error ? erro.message : 'Erro ao validar o plano de cenas.', { tone: 'error' }),
    });
  };

  return { validarOPlano, validando: validar.isPending };
}
