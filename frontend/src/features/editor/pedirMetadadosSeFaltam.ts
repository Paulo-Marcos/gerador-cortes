import { metadadosApi } from '@/features/metadata/api/metadados';

/**
 * D-1041: a primeira geração do bruto também pede os metadados, e a geração grava
 * título, descrição e tags por cima do que houver. Lê o metadado do próprio corte
 * na hora: o export não lista corte devolvido e fica velho logo depois de aprovar,
 * e o título sozinho não prova nada, porque o Fire grava o título proposto. Só há o
 * que preservar com descrição ou opções de título. Corte sem metadado responde com
 * os campos vazios. Sem conseguir ler, não pede: a linha do corte segue mostrando
 * "Completar metadados", e o bruto, que é o pedido do gesto, sai do mesmo jeito.
 */
export async function pedirMetadadosSeFaltam(corteId: string, pedir: () => void): Promise<void> {
  try {
    const meta = await metadadosApi.obterMetadado(corteId);
    if (!meta?.descricao_youtube && !meta?.opcoes_titulo?.length) pedir();
  } catch {
    return;
  }
}
