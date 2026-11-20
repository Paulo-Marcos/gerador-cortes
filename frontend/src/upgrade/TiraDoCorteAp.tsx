import { MedidorDeEtapas } from '@/components/ui/medidor-de-etapas';
import type { Tira } from './tiraDoCorte';

// D-1144 (E-069 H-14, DIRECAO §5): as siglas `BRU CEN GRD OVL FIN THU MET YT`, com os três
// grupos CENAS · RENDER · PUBLICAÇÃO, saíram. Sigla de três letras não se lê; o
// `MedidorDeEtapas` mostra ONDE o corte está e a frase diz o que falta. A regra continua em
// `montarTira` (`tiraDoCorte.ts`): aqui só se escolhe com ou sem a frase.

/**
 * A tira para a lista lateral (145 px): só os oito traços. A frase, que não cabe na coluna,
 * fica inteira no `aria-label` do medidor, para o leitor de tela.
 */
export function TiraMini({ tira }: { tira: Tira }) {
  return <MedidorDeEtapas tira={tira} comFrase={false} className="mt-1" />;
}

/** A tira da Pós e do modal: os traços e a frase "3 de 8 · próximo: renderizar overlays". */
export function TiraDoCorteAp({ tira, compacta = false }: { tira: Tira; compacta?: boolean }) {
  return <MedidorDeEtapas tira={tira} comFrase={!compacta} />;
}
