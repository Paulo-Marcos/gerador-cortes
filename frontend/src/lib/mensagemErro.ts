/** D-1204: o que o operador lê quando o backend não responde, e o que ele pode fazer. */
export const SEM_BACKEND = 'O app não conseguiu falar com o backend. Confira se ele está rodando.';

// O `fetch` que nem chega ao servidor vira um TypeError em inglês, um texto por navegador
// (Chrome/Edge, Firefox, Safari). Outro TypeError é erro de código e segue com a mensagem dele.
const FALHA_DE_REDE = /failed to fetch|networkerror|load failed/i;

/** O texto de um erro para a tela, ou `alternativa` quando não é um `Error` (D-730). */
export function mensagemErro(erro: unknown, alternativa: string): string {
  if (erro instanceof TypeError && FALHA_DE_REDE.test(erro.message)) return SEM_BACKEND;
  return erro instanceof Error ? erro.message : alternativa;
}
