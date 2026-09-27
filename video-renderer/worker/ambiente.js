// Configuração do worker lida do ambiente (D-732: saiu do native_worker.js).

// D-641: eram números soltos no meio do código. Agora têm nome, motivo e
// validação — um env inválido virava NaN e ia parar na linha de comando do
// Remotion, que não reclama e roda com o default dele.
function inteiroDoAmbiente(nome, padrao, minimo) {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === "") return padrao;
  // A string INTEIRA precisa ser um número: `parseInt("3.9.9")` devolve 3 sem
  // reclamar, e aceitar isso seria trocar um erro de digitação por uma
  // configuração silenciosamente diferente da pedida (D-641).
  const valor = /^\d+$/.test(bruto.trim()) ? Number.parseInt(bruto, 10) : Number.NaN;
  if (!Number.isFinite(valor) || valor < minimo) {
    console.warn(
      `⚠️ ${nome}="${bruto}" inválido; usando ${padrao}. (mínimo ${minimo})`,
    );
    return padrao;
  }
  return valor;
}

function buildNodeOptions() {
  const existing = (process.env.NODE_OPTIONS || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((option) => !option.startsWith("--max-old-space-size="));

  return ["--max-old-space-size=8192", ...existing].join(" ");
}

module.exports = { inteiroDoAmbiente, buildNodeOptions };
