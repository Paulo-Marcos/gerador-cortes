import type { Desvio } from '@/types/models';
import { rotuloDoTempo, tempoQueSai } from './perguntaDosDesvios';

// D-1093 (P9, RN-36): a pergunta 1 da aba Decisões. O silêncio é a pausa que o app
// acha no áudio (`origem: tecnico`, de 0,8 s para cima), e a resposta vale para todos:
// tirar todos ou manter todos. A exceção se risca como trecho, e o riscado vale também
// no bruto seguinte (o backend não o recoloca).

export function eSilencioDoApp(desvio: Desvio): boolean {
  return desvio.origem === 'tecnico';
}

/** O que não é silêncio do app: a lista da pergunta 2. */
export function naoESilencioDoApp(desvio: Desvio): boolean {
  return !eSilencioDoApp(desvio);
}

/** `tirar`: todos saem. `manter`: todos riscados. `misto`: você riscou alguns. */
export type RespostaDoSilencio = 'tirar' | 'manter' | 'misto';

export interface SilencioDoCorte {
  /** Os que saem, com o índice na lista do corte (é por ele que se risca). */
  saem: { desvio: Desvio; indice: number }[];
  mantidos: number;
  /** "Sai X" do título: o tempo de todos os silêncios, os que saem e os mantidos. */
  rotulo: string;
  resposta: RespostaDoSilencio;
}

/** `null` quando o corte não tem silêncio nenhum: não há o que perguntar. */
export function silencioDoCorte(desvios: Desvio[], riscados: Desvio[] = []): SilencioDoCorte | null {
  const saem = desvios
    .map((desvio, indice) => ({ desvio, indice }))
    .filter(({ desvio }) => eSilencioDoApp(desvio));
  const mantidos = riscados.filter(eSilencioDoApp);
  if (saem.length === 0 && mantidos.length === 0) return null;
  const resposta: RespostaDoSilencio =
    mantidos.length === 0 ? 'tirar' : saem.length === 0 ? 'manter' : 'misto';
  return {
    saem,
    mantidos: mantidos.length,
    rotulo: rotuloDoTempo(tempoQueSai([...saem.map((s) => s.desvio), ...mantidos])),
    resposta,
  };
}

/** Ao lado do título: o estado da resposta, sem abrir o bloco. */
export function resumoDoSilencio({ resposta, mantidos, saem }: SilencioDoCorte): string {
  if (resposta === 'tirar') return 'todos de uma vez';
  if (resposta === 'manter') return 'todos mantidos';
  return `${saem.length} saem · ${mantidos} ${mantidos === 1 ? 'mantido' : 'mantidos'}`;
}
