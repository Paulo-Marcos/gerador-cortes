/** O texto de um erro para a tela, ou `alternativa` quando não é um `Error` (D-730). */
export function mensagemErro(erro: unknown, alternativa: string): string {
  return erro instanceof Error ? erro.message : alternativa;
}
