import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import type { ProviderIA } from '@/lib/providerIa';

interface Props {
  /** A IA que analisa esta live agora (D-418: o estado é da live, no cache). */
  emVoo: ProviderIA | null;
  asDuasEmVoo: boolean;
  desabilitado: boolean;
  onGerar: (provider: ProviderIA) => void;
  onGerarAsDuas: () => void;
}

/** "Analisar a live" com o Claude, com o Gemini ou com as duas (D-977). */
export function BotaoAnalisarLive({
  emVoo,
  asDuasEmVoo,
  desabilitado,
  onGerar,
  onGerarAsDuas,
}: Props) {
  return (
    <AcaoDeIa
      rotulo="Analisar a live"
      icone="brain"
      rotuloEmVoo="analisando…"
      tamanho="md"
      destaque
      emVoo={emVoo}
      desabilitado={desabilitado}
      onGerar={onGerar}
      asDuas={{ onGerar: onGerarAsDuas, emVoo: asDuasEmVoo }}
    />
  );
}
