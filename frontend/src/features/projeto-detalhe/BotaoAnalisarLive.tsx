import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import type { ProviderIA } from '@/lib/providerIa';
import {
  useAnaliseClaudeEmAndamento,
  useAnalisarComAsDuas,
  useAnalisarComDiarizacao,
} from '@/features/diarizacao/useDiarizacao';

interface Props {
  projetoId: string;
  usarDiarizacao: boolean;
  desabilitado: boolean;
  /** Chamado quando a análise trouxe cortes: o modal fecha. */
  aoConcluir: () => void;
}

/**
 * "Analisar a live" com o Claude, com o Gemini ou com as duas (D-977).
 *
 * D-418: quem manda no spinner é a mutação DESTA live no cache, não o
 * `isPending` do componente — assim a análise de uma live nunca desabilita o
 * botão da outra, e voltar para a live em análise reencontra o "analisando…".
 */
export function BotaoAnalisarLive({ projetoId, usarDiarizacao, desabilitado, aoConcluir }: Props) {
  const analisar = useAnalisarComDiarizacao(projetoId);
  const asDuas = useAnalisarComAsDuas(projetoId);
  const emAndamento = useAnaliseClaudeEmAndamento(projetoId);

  const comUma = (provider: ProviderIA) =>
    analisar.mutate({ usarDiarizacao, provider }, { onSuccess: aoConcluir });

  // Com as duas falhando, o modal fica aberto para tentar de novo.
  const comAsDuas = () =>
    asDuas.mutate(
      { usarDiarizacao },
      { onSuccess: (desfechos) => desfechos.some((d) => d.ok) && aoConcluir() },
    );

  return (
    <AcaoDeIa
      rotulo="Analisar a live"
      icone="brain"
      rotuloEmVoo="analisando…"
      tamanho="md"
      destaque
      emVoo={emAndamento ? (asDuas.vez ?? analisar.variables?.provider ?? 'claude') : null}
      desabilitado={desabilitado}
      onGerar={comUma}
      asDuas={{ onGerar: comAsDuas, emVoo: asDuas.isPending }}
    />
  );
}
