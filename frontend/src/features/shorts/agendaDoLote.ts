/**
 * D-908: a agenda distribuída, do lado da tela.
 *
 * O backend calcula onde cada item cai; aqui mora o que a tela faz com a lista
 * antes do clique — ajustar UMA linha sem recalcular as outras, dizer quais
 * ficaram sem data, e montar o que vai no pedido. Puro, sem React.
 */
import { problemaDoHorario } from './agendamentoDoLote';
import type { AgendaParaEnvio, LinhaDaAgenda } from './loteApi';

/** Como o operador escolhe o "quando" do lote. */
export type ModoDeQuando = 'agora' | 'uma_data' | 'distribuir';

// Espelha `destino_de` em `backend/app/domain/publicacao/escalonamento.py`: o
// Instagram publica no ato (medido: o compositor da web não agenda). O `youtube`
// é o vídeo horizontal do corte, no lote do YouTube longo (D-934).
const PLATAFORMAS_QUE_ESCALONAM = new Set(['youtube', 'youtube_shorts', 'tiktok', 'tiktok_horizontal']);

export function escalona(plataforma: string): boolean {
  return PLATAFORMAS_QUE_ESCALONAM.has(plataforma);
}

export function chaveDaLinha(linha: Pick<LinhaDaAgenda, 'alvo_tipo' | 'alvo_id' | 'plataforma'>) {
  return `${linha.alvo_tipo}:${linha.alvo_id}|${linha.plataforma}`;
}

/**
 * Troca a data de UMA linha. As outras ficam como estão: a previsão é um
 * ponto de partida, não uma fórmula que se refaz a cada toque. A intensidade
 * some porque a hora nova pode cair em outra faixa — e mentir "forte" seria pior
 * que não dizer.
 */
export function ajustarLinha(
  linhas: LinhaDaAgenda[],
  chave: string,
  agendarPara: string,
): LinhaDaAgenda[] {
  return linhas.map((linha) =>
    chaveDaLinha(linha) === chave
      ? { ...linha, agendar_para: agendarPara, intensidade: '', motivo: agendarPara ? '' : linha.motivo }
      : linha,
  );
}

/** Por linha, o que impede a data de passar — a mesma regra da data única. */
export function problemasDasLinhas(
  linhas: LinhaDaAgenda[],
  agora: Date = new Date(),
): Map<string, string> {
  const problemas = new Map<string, string>();
  for (const linha of linhas) {
    if (!linha.agendar_para) continue;
    const problema = problemaDoHorario(linha.agendar_para, [linha.plataforma], agora);
    if (problema) problemas.set(chaveDaLinha(linha), problema);
  }
  return problemas;
}

export interface ResumoDaAgenda {
  comData: number;
  semData: number;
  noAto: number;
}

/** Quantos vão com data, quantos ficaram sem, quantos publicam no ato. */
export function resumoDaAgenda(linhas: LinhaDaAgenda[]): ResumoDaAgenda {
  const resumo: ResumoDaAgenda = { comData: 0, semData: 0, noAto: 0 };
  for (const linha of linhas) {
    if (!escalona(linha.plataforma)) resumo.noAto += 1;
    else if (linha.agendar_para) resumo.comData += 1;
    else resumo.semData += 1;
  }
  return resumo;
}

/** O que vai no pedido: só as redes que escalonam; vazio é "ficou sem data". */
export function paraEnvio(linhas: LinhaDaAgenda[]): AgendaParaEnvio {
  return linhas
    .filter((linha) => escalona(linha.plataforma))
    .map((linha) => ({
      alvo: `${linha.alvo_tipo}:${linha.alvo_id}`,
      plataforma: linha.plataforma,
      agendar_para: linha.agendar_para,
    }));
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "ter 07/01 · 16:00" — como a linha mostra a data proposta. */
export function dataLegivel(agendarPara: string): string {
  const quando = new Date(agendarPara);
  if (Number.isNaN(quando.getTime())) return agendarPara;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${DIAS_CURTOS[quando.getDay()]} ${pad(quando.getDate())}/${pad(quando.getMonth() + 1)} · ${pad(quando.getHours())}:${pad(quando.getMinutes())}`;
}

export const ROTULO_DA_INTENSIDADE: Record<string, string> = {
  forte: 'público forte',
  medio: 'público médio',
  fraco: 'público fraco',
};
