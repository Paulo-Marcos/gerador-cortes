import type { ProviderIA } from '@/lib/providerIa';
import {
  useAnalisarComAsDuas,
  useAnalisarComDiarizacao,
  useQuemAnalisa,
} from '@/features/diarizacao/useDiarizacao';
import {
  algumaDeuCerto,
  type DesfechoDaAnalise,
  type PedidoDeAnalise,
} from '@/features/diarizacao/analiseComAsDuas';

type Disparar<T> = (
  pedido: PedidoDeAnalise,
  opcoes: { onSuccess: (resultado: T) => void },
) => void;

/** Os botões de "Analisar a live" (D-977): o que gira e o que cada clique faz. */
export function montarAcaoDeAnalisar({
  quem,
  usarDiarizacao,
  aoConcluir,
  analisar,
  analisarAsDuas,
}: {
  quem: { provider: ProviderIA | null; asDuas: boolean };
  usarDiarizacao: boolean;
  aoConcluir: () => void;
  analisar: Disparar<unknown>;
  analisarAsDuas: Disparar<DesfechoDaAnalise[]>;
}) {
  return {
    emVoo: quem.provider,
    asDuasEmVoo: quem.asDuas,
    onGerar: (provider: ProviderIA) =>
      analisar({ usarDiarizacao, provider }, { onSuccess: aoConcluir }),
    onGerarAsDuas: () =>
      analisarAsDuas(
        { usarDiarizacao, asDuas: true },
        { onSuccess: (desfechos) => algumaDeuCerto(desfechos) && aoConcluir() },
      ),
  };
}

/**
 * Mora no componente do modal, que fica montado mesmo fechado: o "fechar ao
 * concluir" de uma análise disparada antes de fechar ainda vale ao reabrir.
 */
export function useAcaoDeAnalisar(
  projetoId: string,
  usarDiarizacao: boolean,
  aoConcluir: () => void,
) {
  const analisar = useAnalisarComDiarizacao(projetoId);
  const asDuas = useAnalisarComAsDuas(projetoId);
  return montarAcaoDeAnalisar({
    quem: useQuemAnalisa(projetoId),
    usarDiarizacao,
    aoConcluir,
    analisar: analisar.mutate,
    analisarAsDuas: asDuas.mutate,
  });
}
