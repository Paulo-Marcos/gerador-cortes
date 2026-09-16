// Qual IA atende o clique: a assinatura do Claude (`claude -p`) ou a do
// Antigravity (`agy -p`). O backend aceita o mesmo par em todas as etapas.

export type ProviderIA = 'claude' | 'gemini';

/**
 * O provider que está gerando agora, ou `null` quando nada está em voo.
 *
 * As mutations de IA guardam o provider no `variables`, e é dele que a tela
 * sabe QUAL botão deve girar — sem isso os dois giram no mesmo clique.
 */
export function providerEmVoo(mutation: {
  isPending: boolean;
  variables?: ProviderIA | void;
}): ProviderIA | null {
  return mutation.isPending ? ((mutation.variables as ProviderIA) ?? 'claude') : null;
}

/**
 * Qual assinatura atendeu, a partir do nome do modelo gravado.
 *
 * É assim que uma geração antiga ganha selo sem coluna nova em cada tabela: o
 * nome do modelo já viaja na telemetria e na avaliação do bruto.
 */
export function providerDoModelo(modelo: string | null | undefined): ProviderIA | null {
  if (!modelo) return null;
  return modelo.toLowerCase().includes('gemini') ? 'gemini' : 'claude';
}
