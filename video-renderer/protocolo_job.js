// O pedido que o worker aceita (D-725). A descrição completa, com a resposta,
// está em protocol/job.schema.json; aqui fica só o que o worker CONFERE antes
// de rodar — o que torna a execução impossível. Nível de log e categoria
// continuam tolerantes: o worker os normaliza, como sempre fez.

const VERSAO_DO_PROTOCOLO = 1;

const textoPreenchido = (valor) => typeof valor === "string" && valor.length > 0;

/**
 * Devolve o motivo de o pedido não poder rodar, ou null se ele pode.
 * Pedido sem `v` é da versão 1: foi gravado antes de a versão existir.
 */
function problemaDoPedido(pedido) {
  if (!pedido || typeof pedido !== "object" || Array.isArray(pedido)) {
    return "o pedido não é um objeto";
  }
  const versao = pedido.v ?? 1;
  if (versao !== VERSAO_DO_PROTOCOLO) {
    return `versão ${JSON.stringify(versao)} do protocolo não suportada (este worker fala a ${VERSAO_DO_PROTOCOLO})`;
  }
  if (!textoPreenchido(pedido.id)) return "sem id";
  if (!textoPreenchido(pedido.cwd)) return "sem cwd";
  const { cmd } = pedido;
  if (!Array.isArray(cmd) || cmd.length === 0 || !cmd.every((parte) => typeof parte === "string")) {
    return "cmd precisa ser uma lista de textos não vazia";
  }
  return null;
}

module.exports = { VERSAO_DO_PROTOCOLO, problemaDoPedido };
