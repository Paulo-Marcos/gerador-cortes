import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toaster';
import { useMotivosVisiveis } from '@/features/channels/useMotivosDeExclusao';
import { rawEditorPath } from '@/features/post-production/postProductionNavigation';
import { mensagemErro } from '@/lib/mensagemErro';
import type { Corte } from '@/types/models';
import { cortesApi } from './api/cortes';
import { AvisoDoRiscado } from './AvisoDoRiscado';
import { MOTIVOS_APAGADO } from './motivoApagado';
import { bloqueioDoRiscar, mensagemDoRiscado, proximoDepoisDeRiscar } from './riscarCorte';
import { invalidaCorte } from './useCortes';

const DURACAO_DO_AVISO_MS = 10_000;

/**
 * D-1088: o R do editor risca o corte direto e segue para o próximo. O aviso
 * que fica oferece o motivo e o Desfazer — no lugar do diálogo que vinha antes.
 * O Desfazer é o "Trazer de volta": devolve a etapa e o app regera o bruto.
 * As ações do aviso chamam a API sem hook: quando o operador clica, o editor
 * já é o do corte seguinte.
 * D-1096: a linha do Workspace usa o mesmo hook. Lá o Desfazer não leva ao
 * editor: o corte volta na própria lista, e `aoDesfazer` diz o que fazer.
 */
export function useRiscarCorte(
  corte: Corte | undefined,
  cortes: readonly Corte[],
  projetoId: string,
  /** Para onde a tela segue: o índice do próximo corte em `cortes`, ou -1 se não sobra nenhum. */
  seguir: (proximo: number) => void,
  /** Depois do Desfazer; sem ele, abre o corte de volta no editor. */
  aoDesfazer?: (alvo: Corte) => void,
) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { notify, dismiss } = useToast();
  const motivosDoCanal = useMotivosVisiveis() ?? MOTIVOS_APAGADO;
  const riscar = useMutation({ mutationFn: (corteId: string) => cortesApi.riscarCorte(corteId) });
  const bloqueio = corte ? bloqueioDoRiscar(corte) : null;

  function avisar(alvo: Corte, jaEstavaRiscado: boolean, liberadoMb: number, naoRemovidos: number) {
    const atualizar = () => invalidaCorte(qc, alvo.id, projetoId);
    const desfazer = async () => {
      dismiss(id);
      try {
        await cortesApi.trazerDeVolta(alvo.id);
        atualizar();
        if (aoDesfazer) aoDesfazer(alvo);
        else navigate(rawEditorPath(projetoId, alvo.id));
      } catch (erro) {
        notify(mensagemErro(erro, 'Não deu para desfazer.'), { tone: 'error' });
      }
    };
    const id = notify(mensagemDoRiscado(alvo, liberadoMb, naoRemovidos), {
      title: 'Corte riscado.',
      tone: 'info',
      duracaoMs: DURACAO_DO_AVISO_MS,
      conteudo: (
        <AvisoDoRiscado
          // D-993: só a proposta da IA tem motivo a medir; o corte feito na mão não.
          motivos={alvo.origem_analise ? motivosDoCanal : []}
          // D-1092: o motivo aparece no chip da seção Riscados, então a lista relê o corte.
          onMotivos={(slugs) =>
            void cortesApi.riscarCorte(alvo.id, slugs).then(atualizar, () => undefined)
          }
          onDesfazer={jaEstavaRiscado ? undefined : () => void desfazer()}
        />
      ),
    });
  }

  function riscarCorte() {
    if (!corte || riscar.isPending) return;
    if (bloqueio) {
      notify('Um corte publicado não se risca.', { title: `${bloqueio}.`, tone: 'warning' });
      return;
    }
    const alvo = corte;
    const proximo = proximoDepoisDeRiscar(cortes, alvo.id);
    const indiceDoProximo = proximo ? cortes.indexOf(proximo) : -1;
    riscar.mutate(alvo.id, {
      onSuccess: (resultado) => {
        invalidaCorte(qc, alvo.id, projetoId);
        avisar(
          alvo,
          resultado.status_anterior === 'rejeitado',
          resultado.liberado_mb,
          resultado.nao_removidos?.length ?? 0,
        );
        // Segue para o próximo corte, como o excluir fazia. O ajuste não salvo NÃO
        // é descartado: a saída o grava no corte riscado, como em qualquer troca de
        // corte. A D-883 descartava porque o corte excluído sumia e o salvar dava
        // 404; o riscado continua no banco e guarda o trabalho do operador.
        seguir(indiceDoProximo);
      },
      onError: (erro) => notify(mensagemErro(erro, 'Não deu para riscar o corte.'), { tone: 'error' }),
    });
  }

  return { riscarCorte, bloqueio, riscando: riscar.isPending };
}
