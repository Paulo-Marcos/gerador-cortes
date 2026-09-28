// D-803: a fila de Fires agrupada pela live de onde os cortes saíram.
//
// Os Fires de uma live dividem a matéria-prima: se a live foi limpa, baixá-la
// de novo serve a todos eles de uma vez. Com a lista solta, o operador não via
// que "aqueles dois sem bruto" eram da mesma live — e resolvia um por um.
//
// A regra mora aqui, e não no JSX, pelo mesmo motivo de `filtrosDosFires.ts`:
// regra escondida em componente é regra que ninguém revisa.
import type { FireComBruto } from './shortsApi';

export interface GrupoDaLive {
  projetoId: string;
  titulo: string;
  /** Os cortes desta live que o filtro e a busca deixaram à vista. */
  fires: FireComBruto[];
  /** Quantos Fires a live tem na fábrica, filtro à parte. */
  totalDaLive: number;
  /** Quantos entram num clique de "gerar a live": abertos, sem bruto ou sem candidato. */
  pendentes: number;
  /** Algum pendente precisa de bruto e a live não está no disco. */
  precisaBaixar: boolean;
}

/** O espelho de `_fires_pendentes` no backend: o que a fábrica da live vai atender. */
export function estaPendente(fire: FireComBruto): boolean {
  return !fire.finalizado_em && (!fire.tem_bruto || fire.shorts.total === 0);
}

/**
 * Agrupa `visiveis` por live, na ordem em que a lista as trouxe (a do trabalho
 * mais recente). As contagens do cabeçalho vêm de `todos`: o botão da live age
 * sobre a live inteira, e o número ao lado dele não pode mudar com o filtro.
 */
export function agruparPorLive(visiveis: FireComBruto[], todos: FireComBruto[]): GrupoDaLive[] {
  const daLive = new Map<string, FireComBruto[]>();
  for (const fire of todos) {
    daLive.set(fire.projeto_id, [...(daLive.get(fire.projeto_id) ?? []), fire]);
  }

  const grupos = new Map<string, GrupoDaLive>();
  for (const fire of visiveis) {
    let grupo = grupos.get(fire.projeto_id);
    if (!grupo) {
      const inteira = daLive.get(fire.projeto_id) ?? [fire];
      const pendentes = inteira.filter(estaPendente);
      grupo = {
        projetoId: fire.projeto_id,
        titulo: fire.projeto_titulo,
        fires: [],
        totalDaLive: inteira.length,
        pendentes: pendentes.length,
        precisaBaixar: pendentes.some((f) => !f.tem_bruto) && !fire.live_em_disco,
      };
      grupos.set(fire.projeto_id, grupo);
    }
    grupo.fires.push(fire);
  }

  for (const grupo of grupos.values()) grupo.fires.sort((a, b) => a.numero - b.numero);
  return [...grupos.values()];
}
