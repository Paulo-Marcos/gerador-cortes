/**
 * O interruptor do mascote — o único lugar que o lê (D-733).
 *
 * Repo público nasce sem mascote (D-179); o canal que tem o mascote liga o
 * interruptor. O valor é trocado em tempo de build: pelo DefinePlugin no
 * remotion.config.ts (render) e pelo `define` no vite.config.ts (prévia do
 * frontend), a partir da presença de public/sapo no canal (D-197). Por isso a
 * linha precisa ficar escrita exatamente assim — os dois procuram este texto.
 */
export function mascoteHabilitado(): boolean {
  // `ts-ignore`, e não `ts-expect-error`: o tsc deste projeto roda em
  // module:commonjs (onde `import.meta` é erro), mas o do frontend compila este
  // arquivo pelo alias @video-renderer em module:ESNext, onde a linha é válida.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return import.meta.env.VITE_CANAL_MASCOTE_HABILITADO === "true";
}
