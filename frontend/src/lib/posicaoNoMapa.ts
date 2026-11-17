// D-1121 (E-069 H-11a) · Onde cada corte nasceu, em porcentagem da live.
//
// O mapa da live vai de 0:00 ao fim; cada corte é uma pílula na posição em que foi tirado
// (DIRECAO §6, MapaDaLive). Esta regra é pura: o componente só lê os números e os entrega ao
// CSS por variável (`--inicio`, `--largura`), sem calcular geometria no JSX.

export type PosicaoNoMapa = {
  /** Onde a pílula começa, de 0 a 100. */
  inicioPct: number;
  /** Quanto ela ocupa, de 0 a 100 − `inicioPct`. */
  larguraPct: number;
};

const duasCasas = (n: number) => Math.round(n * 100) / 100;

/**
 * A posição de um corte no mapa, ou `null` quando a live não tem duração conhecida
 * (zero, negativa ou não numérica): sem o todo, "porcentagem do todo" não existe, e
 * inventar uma posição seria mentir sobre onde o corte nasceu.
 *
 * Um corte que passa do fim da live, ou que vem com o fim antes do início, é aparado para
 * caber no mapa em vez de estourar a pista.
 */
export function posicaoNoMapa(
  inicioSeg: number,
  fimSeg: number,
  duracaoSeg: number,
): PosicaoNoMapa | null {
  if (!Number.isFinite(duracaoSeg) || duracaoSeg <= 0) return null;
  const inicio = Math.min(Math.max(Number.isFinite(inicioSeg) ? inicioSeg : 0, 0), duracaoSeg);
  const fim = Math.min(Math.max(Number.isFinite(fimSeg) ? fimSeg : inicio, inicio), duracaoSeg);
  return {
    inicioPct: duasCasas((inicio / duracaoSeg) * 100),
    larguraPct: duasCasas(((fim - inicio) / duracaoSeg) * 100),
  };
}

export type MarcaDoMapa = { seg: number; pct: number };

/** As marcas de 1 px da pista: uma a cada 30 min (o `passo`), sem a do 0:00 nem a do fim. */
export function marcasDoMapa(duracaoSeg: number, passoSeg = 1800): MarcaDoMapa[] {
  if (!Number.isFinite(duracaoSeg) || duracaoSeg <= 0 || passoSeg <= 0) return [];
  const marcas: MarcaDoMapa[] = [];
  for (let seg = passoSeg; seg < duracaoSeg; seg += passoSeg) {
    marcas.push({ seg, pct: duasCasas((seg / duracaoSeg) * 100) });
  }
  return marcas;
}

/** "0:53:26" e "2:41:00": a live sempre mostra a hora, mesmo quando é 0 (o mapa lê de 0:00 ao fim). */
export function tempoDaLive(seg: number): string {
  const total = Number.isFinite(seg) && seg > 0 ? Math.floor(seg) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
