// D-921: os presets de palco (posicionamento do horizontal e palco do short)
// lembram o estilo em que foram montados, e os modais só mostram os do estilo
// escolhido. Preset salvo antes disso não tem a chave e conta como o estilo de
// sempre — espelha `estilo_do_preset` em backend/app/domain/canal/palco_componentes.py.

export type EstiloDoPalco = 'atual' | 'limpo';

/** O estilo de um preset pelo payload; sem a chave, o estilo de sempre. */
export function estiloDoPreset(payload: unknown): EstiloDoPalco {
  const estilo = (payload as { estilo?: unknown } | null | undefined)?.estilo;
  return estilo === 'limpo' ? 'limpo' : 'atual';
}

/** Só os presets montados no estilo escolhido. */
export function presetsDoEstilo<T extends { payload?: unknown }>(presets: readonly T[], estilo: EstiloDoPalco): T[] {
  return presets.filter((preset) => estiloDoPreset(preset.payload) === estilo);
}
