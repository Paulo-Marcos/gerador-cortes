import type { Schema } from '@/shared/api';
import type { OrigemNoPlano } from './planoDasCenas';

// ─────────────────────────────────────────────────────────────────────────────
// O ajuste de uma cena só pela IA (D-1074, RN-40): as regras do card, sem React.
// O operador pede a mudança citando a cena; a resposta é uma proposta, e só o Aceitar
// grava aquela cena, sobre o plano que o pedido leu.
// ─────────────────────────────────────────────────────────────────────────────

export type PropostaDeAjuste = Schema<'PropostaDeAjusteResponse'>;

/** O id do ajuste em voo na fila global: é por ele que o Cancelar mata o processo da IA. */
export const jobDoAjuste = (corteId: string) => `ajuste:${corteId}`;

export const ajusteDaCenaKey = (corteId: string) => ['ajuste-da-cena', corteId] as const;

/** A cena pela identidade do plano, como a conferência a identifica: `tipo` + início. */
export type IdentidadeDaCena = { tipo: string; inicio: number };

export const mesmaCena = (a: IdentidadeDaCena, b: IdentidadeDaCena) =>
  a.tipo === b.tipo && Math.abs(a.inicio - b.inicio) < 0.01;

/** Só a cena da IA recebe ajuste: a manual é do operador, e a riscada está fora do vídeo. */
export const aceitaAjuste = (origem: OrigemNoPlano) => origem === 'conferida' || origem === 'conferir';

/**
 * Por que o pedido não pode sair agora, ou `null`. O plano sem salvar vem primeiro: a IA
 * lê o plano salvo, e aceitar recarrega o plano, levando o que não foi salvo.
 */
export function motivoParaNaoAjustar({
  dirty,
  emGeracao,
  outroAjusteEmVoo,
}: {
  dirty: boolean;
  emGeracao: boolean;
  outroAjusteEmVoo: boolean;
}): string | null {
  if (dirty) return 'Salve as cenas antes de pedir um ajuste.';
  if (emGeracao) return 'Espere as cenas terminarem de ser geradas.';
  if (outroAjusteEmVoo) return 'Outra cena deste corte está sendo ajustada. Espere ou cancele.';
  return null;
}

/**
 * Onde o cartão aparece: no card da cena selecionada, e no da cena do ajuste enquanto a IA
 * trabalha ou a proposta espera (mesmo que o vídeo tenha saído dela).
 */
export function estadoDoCartao({
  cena,
  ativa,
  alvo,
  pedindo,
  temProposta,
}: {
  cena: IdentidadeDaCena;
  ativa: boolean;
  alvo: IdentidadeDaCena | null;
  pedindo: boolean;
  temProposta: boolean;
}): 'oculto' | 'pedido' | 'pedindo' | 'proposta' {
  const doAjuste = alvo !== null && mesmaCena(alvo, cena);
  if (doAjuste && pedindo) return 'pedindo';
  if (doAjuste && temProposta) return 'proposta';
  return ativa ? 'pedido' : 'oculto';
}

/** O mesmo motivo, na hora de aceitar: com o plano sujo, aceitar levaria o que não foi salvo. */
export const motivoParaNaoAceitar = (dirty: boolean): string | null =>
  dirty ? 'Há mudanças sem salvar no plano. Salve-as e peça o ajuste de novo.' : null;

/** O que o Aceitar manda: a versão do plano que a IA leu, a cena pela identidade e a nova. */
export const aceiteDa = (proposta: PropostaDeAjuste): Schema<'AceitarAjusteRequest'> => ({
  versao: proposta.versao,
  tipo: String(proposta.antes.tipo),
  inicio: Number(proposta.antes.inicio),
  depois: proposta.depois,
});

const ROTULOS: Record<string, string> = {
  tipo: 'Tipo',
  texto: 'Texto',
  subtexto: 'Subtexto',
  contexto: 'Contexto',
  nome_curto: 'Nome curto',
  numero: 'Número',
  autor: 'Autor',
  obra: 'Obra',
  ano: 'Ano',
  fonte: 'Fonte',
  rotuloA: 'Rótulo A',
  rotuloB: 'Rótulo B',
  frase_da_fala: 'Frase da fala',
  quem_disse: 'Quem disse',
  inicio: 'Início',
  fim: 'Fim',
  itens: 'Itens',
  marcos: 'Marcos',
  mascotMood: 'Humor do mascote',
  layout_card: 'Layout do card',
  sombra_nivel: 'Sombra',
  modelo_cena: 'Modelo da cena',
};

// O par `_seg` repete `inicio`/`fim`, e `motivo` é a justificativa da IA: não são o que
// o operador confere no antes e depois.
const FORA_DA_COMPARACAO = new Set(['inicio_seg', 'fim_seg', 'motivo', 'ancoraLegendas']);

export interface CampoQueMudou {
  campo: string;
  rotulo: string;
  antes: string;
  depois: string;
}

const comoTexto = (valor: unknown): string => {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (typeof valor === 'number') return Number.isInteger(valor) ? String(valor) : valor.toFixed(1);
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
};

/** O antes e o depois de cada campo que a IA mudou, na ordem dos rótulos e o resto depois. */
export function camposQueMudaram(antes: Record<string, unknown>, depois: Record<string, unknown>): CampoQueMudou[] {
  const ordem = Object.keys(ROTULOS);
  const posicao = (campo: string) => (ordem.includes(campo) ? ordem.indexOf(campo) : ordem.length);
  return [...new Set([...Object.keys(antes), ...Object.keys(depois)])]
    .filter((campo) => !FORA_DA_COMPARACAO.has(campo))
    .filter((campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]))
    .sort((a, b) => posicao(a) - posicao(b))
    .map((campo) => ({
      campo,
      rotulo: ROTULOS[campo] ?? campo,
      antes: comoTexto(antes[campo]),
      depois: comoTexto(depois[campo]),
    }));
}

export const NOME_DO_PROVEDOR: Record<PropostaDeAjuste['provider'], string> = {
  claude: 'Claude',
  gemini: 'Gemini',
};
