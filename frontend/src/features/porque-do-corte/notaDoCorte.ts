import type { TomDoSelo } from '@/upgrade/SeloDeEstado';

// ─────────────────────────────────────────────────────────────────
// D-886 · A nota que a IA deu ao corte, lida para a tela.
//
// O `score` da proposta (D-302) traz três notas de 0 a 10 — gancho, fluxo e
// valor — e um `total`. A skill não diz que o total é a soma (embora a IA some:
// 346 de 346 cortes na PROD em 05/10/2026), então a tela soma as três ela mesma
// e mostra "22/30": o operador compara com o que ele acha sem fazer conta.
//
// A nota é um RANKING RELATIVO entre os cortes da mesma análise, não uma nota
// absoluta de qualidade (a skill `cortes` diz isso). O modal repete o aviso.
// ─────────────────────────────────────────────────────────────────

export const NOTA_MAXIMA = 30;

const PARTES = [
  { chave: 'hook', rotulo: 'Gancho', pergunta: 'O começo segura o scroll?' },
  { chave: 'flow', rotulo: 'Fluxo', pergunta: 'Constrói e resolve a tensão?' },
  { chave: 'value', rotulo: 'Valor', pergunta: 'Quem assiste sai com algo?' },
] as const;

export type ParteDaNota = { rotulo: string; pergunta: string; valor: number };

export type NotaDoCorte = {
  total: number;
  texto: string;
  partes: ParteDaNota[];
  tom: TomDoSelo;
};

/**
 * Lê o `score` do corte. Sem nenhuma nota numérica (corte manual, análise
 * anterior à D-302) não há nota — e a tela não desenha selo vazio.
 *
 * Com as três partes, o total é a soma delas: a skill pede "o total" sem dizer
 * que é a soma, e o "/30" do selo não pode desmentir as barras se a IA um dia
 * escrever a média. Faltando parte, vale o `total` da IA; sem ele, a soma do
 * que veio.
 */
export function lerNotaDoCorte(score: Record<string, number> | undefined): NotaDoCorte | null {
  if (!score) return null;
  const partes = PARTES.filter((p) => typeof score[p.chave] === 'number').map((p) => ({
    rotulo: p.rotulo,
    pergunta: p.pergunta,
    valor: score[p.chave],
  }));
  if (partes.length === 0 && typeof score.total !== 'number') return null;
  const soma = partes.reduce((acc, p) => acc + p.valor, 0);
  const total =
    partes.length === PARTES.length || typeof score.total !== 'number' ? soma : score.total;
  return { total, texto: `${total}/${NOTA_MAXIMA}`, partes, tom: tomDaNota(total) };
}

/**
 * O tom do selo. Os cortes da PROD ficam entre 17 e 29: 24+ é o terço de cima
 * (ok), 20 a 23 o meio (info) e abaixo de 20 é o que a própria IA achou fraco
 * (aviso). Não é veredito — é onde ela pôs o corte na fila.
 */
export function tomDaNota(total: number): TomDoSelo {
  if (total >= 24) return 'ok';
  if (total >= 20) return 'info';
  return 'aviso';
}

/** A dica do selo: as três notas numa linha, para ler sem abrir o modal. */
export function dicaDaNota(nota: NotaDoCorte): string {
  const partes = nota.partes.map((p) => `${p.rotulo} ${p.valor}`).join(' · ');
  return `Nota da IA ${nota.texto}${partes ? ` (${partes})` : ''} — W explica por quê`;
}
