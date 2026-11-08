import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '@/components/ui/toaster';
import { useCenasEmGeracao } from '@/features/editor/useGeracoesDaIa';
import { invalidaCorte, useCorte } from '@/features/editor/useCortes';
import { mensagemErro } from '@/lib/mensagemErro';
import { ErroDaApi } from '@/shared/api';
import { exportStatusKey, rodadasDasCenasKey, todasAsRodadasDasCenasKey } from '@/shared/chavesDeCache';
import { cenasApi } from '../api/cenas';
import { fraseDepoisDeTrocar, montarBotaoDoDesfazer, type RodadasDasCenas } from './regrasDaRodada';

/** A frase do servidor (`detail`) é a que o operador lê; o status HTTP é ruído (D-1065). */
const motivoDaRecusa = (erro: unknown) =>
  erro instanceof ErroDaApi ? erro.detalhe : mensagemErro(erro, 'Não foi possível trocar a rodada.');

/**
 * As rodadas das cenas do corte e o "Desfazer rodada" (D-1073, RN-37). A comparação segue a
 * versão do corte em cache: gerou, salvou ou desfez, ela compara de novo.
 *
 * O desfazer manda a `versao` que a tela mostrou; se as cenas mudaram desde então, o
 * servidor recusa e diz por quê. Dando certo ou não, o plano recarrega: a lista, a marca de
 * validadas (que viaja com a rodada) e o render final travado (D-1072) seguem o banco.
 */
export function useRodadaDoPlano(corteId: string, projetoId: string, dirty: boolean) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const { dataUpdatedAt } = useCorte(corteId);
  const { emGeracao } = useCenasEmGeracao(corteId, projetoId);
  const [comparando, setComparando] = useState(false);
  const {
    data: rodadas,
    dataUpdatedAt: lidasEm,
    isError: falhou,
  } = useQuery({
    queryKey: rodadasDasCenasKey(corteId, dataUpdatedAt),
    queryFn: () => cenasApi.compararRodadas(corteId),
    placeholderData: keepPreviousData,
  });
  const trocar = useMutation({
    mutationFn: (versao: string) => cenasApi.desfazerRodada(corteId, versao),
    onSuccess: (nova: RodadasDasCenas) => {
      notify(fraseDepoisDeTrocar(nova, Date.now()), { tone: nova.atual.validadas ? 'success' : 'info' });
      setComparando(false);
    },
    onError: (erro: unknown) => notify(motivoDaRecusa(erro), { tone: 'error' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: todasAsRodadasDasCenasKey(corteId) });
      invalidaCorte(qc, corteId, projetoId);
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId), refetchType: 'all' });
    },
  });
  // "Há quanto tempo" conta a partir de quando o servidor respondeu, não do relógio no
  // render: o render fica puro, e a consulta relê ao voltar à janela e a cada gravação.
  const agora = lidasEm;
  const botao = montarBotaoDoDesfazer({ rodadas, emGeracao, dirty, desfazendo: trocar.isPending, agora });
  const desfazer = () => {
    if (rodadas && !botao.desabilitado) trocar.mutate(rodadas.versao);
  };
  return { rodadas, falhou, agora, botao, desfazer, comparando, setComparando };
}
