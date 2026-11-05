import { metadadosApi } from '@/features/metadata/api/metadados';

/**
 * D-1041: a primeira geração do bruto também pede os metadados. D-1043: o backend só
 * preenche o que falta, então esta leitura não protege texto: evita pagar uma geração
 * sem nada a preencher. Lê o metadado do próprio corte na hora: o export não lista
 * corte devolvido e fica velho logo depois de aprovar, e o título sozinho não prova
 * nada, porque o Fire grava o título proposto. Sem conseguir ler, não pede: a linha do
 * corte segue mostrando "Completar metadados".
 */
export async function pedirMetadadosSeFaltam(corteId: string, pedir: () => void): Promise<void> {
  try {
    const meta = await metadadosApi.obterMetadado(corteId);
    if (!meta?.descricao_youtube && !meta?.opcoes_titulo?.length) pedir();
  } catch {
    return;
  }
}
