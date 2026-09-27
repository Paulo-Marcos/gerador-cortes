/**
 * Rótulo curto do projeto para a aba/rail ("267" em "LIVE 267 —
 * Respondendo inscritos"). Sem número no título, usa o começo dele.
 */
export function rotuloCurtoProjeto(tituloLive: string | undefined): string {
  const titulo = (tituloLive ?? '').trim();
  if (!titulo) return '?';
  const numero = /\b(\d{2,4})\b/.exec(titulo);
  if (numero) return numero[1];
  return titulo.length > 14 ? `${titulo.slice(0, 12)}…` : titulo;
}
