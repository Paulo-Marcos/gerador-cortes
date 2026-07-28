import type { PedidoConfirmacao } from '@/components/ui/confirm-dialog';
import type { RegerarBrutoOpcoes } from './regerarBrutoPlan';

// ─────────────────────────────────────────────────────────────
// regeracaoConfirmacao (D-428) — decide se uma acao do editor e' PRIMEIRA
// execucao (dispara direto) ou RE-execucao (pede confirmacao) e monta o texto
// do dialogo. Puro de proposito: o "ja tem resultado?" e o que exatamente se
// perde sao regra, nao layout — ficam testaveis fora do React.
//
// Cada funcao devolve `null` quando NAO ha nada a confirmar.
// ─────────────────────────────────────────────────────────────

function pluralizar(quantidade: number, um: string, varios: string): string {
  return `${quantidade} ${quantidade === 1 ? um : varios}`;
}

/**
 * Trechos via Claude ACRESCENTA aos desvios existentes (nao apaga) — o custo
 * de repetir e' lista poluida + tempo de Claude, nao perda de trabalho.
 */
export function confirmacaoRegerarTrechos(totalDesvios: number): PedidoConfirmacao | null {
  if (totalDesvios <= 0) return null;
  return {
    titulo: 'Analisar trechos de novo?',
    detalhe: pluralizar(totalDesvios, 'trecho ja marcado', 'trechos ja marcados'),
    descricao:
      'Este corte ja tem trechos marcados. Uma nova analise ACRESCENTA os trechos que o Claude encontrar — os atuais continuam na lista, inclusive os que voce marcou a mao.',
    confirmLabel: 'Analisar de novo',
  };
}

/**
 * Cenas SOBRESCREVEM o roteiro visual inteiro (o backend reescreve
 * `cenas_remotion`), levando junto edicoes manuais e a marca de validadas.
 */
export function confirmacaoRegerarCenas(totalCenas: number): PedidoConfirmacao | null {
  if (totalCenas <= 0) return null;
  return {
    titulo: 'Gerar cenas de novo?',
    detalhe: pluralizar(totalCenas, 'cena atual', 'cenas atuais'),
    descricao:
      'Gerar de novo SUBSTITUI todas as cenas deste corte. Edicoes manuais, retratos preenchidos e a marca de validadas serao perdidos.',
    confirmLabel: 'Substituir cenas',
    tone: 'danger',
  };
}

const ROTULOS_OPT_IN: [keyof RegerarBrutoOpcoes, string][] = [
  ['transcricao', 'transcricao'],
  ['cenas', 'cenas'],
  ['metadados', 'metadados'],
  ['desvios', 'trechos a remover'],
];

/** Opt-ins marcados no dropdown "Tambem refazer", em rotulo legivel. */
export function rotulosDosOptIns(opts: RegerarBrutoOpcoes): string[] {
  return ROTULOS_OPT_IN.filter(([chave]) => opts[chave]).map(([, rotulo]) => rotulo);
}

/**
 * Bruto so' pede confirmacao quando ja existe clip — a 1a geracao e' o fluxo
 * normal do corte.
 */
export function confirmacaoRegerarBruto(
  brutoPronto: boolean,
  opts: RegerarBrutoOpcoes,
): PedidoConfirmacao | null {
  if (!brutoPronto) return null;
  const refazendo = rotulosDosOptIns(opts);
  const extras =
    refazendo.length > 0 ? ` Junto com o bruto, sera(ao) refeito(s): ${refazendo.join(', ')}.` : '';
  return {
    titulo: 'Regerar o bruto?',
    detalhe: 'o video bruto ja existe',
    descricao: `O video bruto deste corte sera renderizado de novo, substituindo o atual.${extras}`,
    confirmLabel: 'Regerar bruto',
    tone: 'danger',
  };
}
