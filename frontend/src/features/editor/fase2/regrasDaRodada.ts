import type { Schema } from '@/shared/api';
import type { IconName } from '@/upgrade/Icon';
import type { OrigemNoPlano } from './planoDasCenas';

// ─────────────────────────────────────────────────────────────────────────────
// A rodada do plano de cenas na Pós (D-1073, RN-37). A API guarda duas rodadas, a
// atual e a anterior, e desfazer troca as duas de lugar (D-1071): o mesmo botão
// desfaz e refaz. A validação viaja com a rodada: o plano que volta traz a marca que
// tinha, e o render final (D-1072) segue essa marca. Aqui ficam as frases e os
// estados; a tela só desenha.
// ─────────────────────────────────────────────────────────────────────────────

export type RodadasDasCenas = Schema<'RodadasDasCenasResponse'>;
type Rodada = Schema<'RodadaDasCenasResponse'>;
type Diferencas = Schema<'DiferencasDasRodadasResponse'>;
type Cena = Record<string, unknown>;

const QUEM_GEROU: Record<string, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  manual: 'resposta colada à mão',
};

/** O backend grava a hora em UTC sem fuso (`utcnow()`): sem sufixo, a hora é UTC. */
export function lerHoraDoServidor(iso: string): number {
  const temFuso = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(temFuso ? iso : `${iso}Z`).getTime();
}

export function haQuantoTempo(iso: string | null | undefined, agora: number): string | null {
  if (!iso) return null;
  const passou = agora - lerHoraDoServidor(iso);
  if (!Number.isFinite(passou)) return null;
  const minutos = Math.floor(Math.max(0, passou) / 60_000);
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** Quem gerou e quando: "Claude · há 4 min". Rodada de antes da D-1071 não tem registro. */
export function descreverRodada(rodada: Rodada, agora: number): string {
  const quem = rodada.origem ? (QUEM_GEROU[rodada.origem] ?? rodada.origem) : 'origem não registrada';
  return [quem, haQuantoTempo(rodada.gerada_em, agora)].filter(Boolean).join(' · ');
}

/** A linha do cabeçalho. A API guarda duas rodadas e não as numera: "atual" é o que se sabe. */
export const linhaDaRodada = (rodadas: RodadasDasCenas, agora: number): string =>
  `rodada atual · ${descreverRodada(rodadas.atual, agora)}`;

/** Há o que mostrar: um plano gravado ou uma rodada guardada. Corte sem cenas nunca geradas, não. */
export const temRodada = (rodadas: RodadasDasCenas | undefined): rodadas is RodadasDasCenas =>
  Boolean(rodadas && (rodadas.atual.cenas.length > 0 || rodadas.anterior));

/**
 * A anterior é a mais nova: o operador já desfez, e o botão agora refaz. A rodada sem
 * hora é de antes da D-1071, que passou a gravá-la, e por isso é sempre a mais velha:
 * na tela, com a anterior datada, o operador já desfez. Sem hora nenhuma, desfazer.
 */
export function jaDesfez(rodadas: RodadasDasCenas): boolean {
  const atual = rodadas.atual.gerada_em;
  const anterior = rodadas.anterior?.gerada_em;
  if (!anterior) return false;
  return !atual || lerHoraDoServidor(anterior) > lerHoraDoServidor(atual);
}

const comoVolta = (rodada: Rodada) =>
  rodada.validadas ? 'Ele volta validado.' : 'Ele volta sem validar: o render final espera a validação.';

export interface BotaoDoDesfazer {
  rotulo: string;
  icone: IconName;
  dica: string;
  desabilitado: boolean;
  /** Por que está desabilitado, para a tela mostrar ao lado: o tooltip não abre em botão desabilitado. */
  motivo: string | null;
  trocando: boolean;
}

/**
 * O "Desfazer rodada": diz o que vai acontecer (desfazer ou refazer) e o que acontece com a
 * validação. Desabilitado sem rodada anterior, durante a geração (o backend recusa: a marca
 * das cenas está com ela) e com cenas editadas sem salvar, que a troca jogaria fora.
 */
export function montarBotaoDoDesfazer(p: {
  rodadas: RodadasDasCenas | undefined;
  emGeracao: boolean;
  dirty: boolean;
  desfazendo: boolean;
  agora: number;
}): BotaoDoDesfazer {
  const refaz = p.rodadas ? jaDesfez(p.rodadas) : false;
  const rotulo = refaz ? 'Refazer rodada' : 'Desfazer rodada';
  const icone: IconName = refaz ? 'redo-2' : 'undo-2';
  const anterior = p.rodadas?.anterior;
  const motivo = !anterior
    ? 'Não há rodada anterior para voltar.'
    : p.emGeracao
      ? 'Espere as cenas terminarem de ser geradas.'
      : p.dirty
        ? 'Salve as cenas antes de trocar de rodada.'
        : null;
  if (motivo || !anterior) {
    return { rotulo, icone, dica: motivo ?? '', desabilitado: true, motivo, trocando: false };
  }
  const quem = descreverRodada(anterior, p.agora);
  const dica = refaz
    ? `Traz de volta o plano mais novo (${quem}). ${comoVolta(anterior)}`
    : `Volta ao plano anterior (${quem}). ${comoVolta(anterior)} Clicar de novo traz este de volta.`;
  return { rotulo, icone, dica, desabilitado: p.desfazendo, motivo: null, trocando: p.desfazendo };
}

/** O que dizer depois que o servidor trocou as rodadas: só com a resposta dele em mãos. */
export function fraseDepoisDeTrocar(nova: RodadasDasCenas, agora: number): string {
  const feito = jaDesfez(nova) ? 'Rodada desfeita' : 'Rodada refeita';
  const validacao = nova.atual.validadas
    ? 'Ele já estava validado.'
    : 'Valide o plano para liberar o render final.';
  return `${feito}: o plano agora é o de ${descreverRodada(nova.atual, agora)}. ${validacao}`;
}

// ── A comparação ──────────────────────────────────────────────────────────────

export function resumirDiferencas(d: Diferencas): string {
  const partes = [
    d.entraram.length && `${d.entraram.length} ${d.entraram.length === 1 ? 'entrou' : 'entraram'}`,
    d.sairam.length && `${d.sairam.length} ${d.sairam.length === 1 ? 'saiu' : 'saíram'}`,
    d.mudaram.length && `${d.mudaram.length} ${d.mudaram.length === 1 ? 'mudou' : 'mudaram'}`,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'As duas rodadas têm as mesmas cenas.';
}

/**
 * Como a cena aparece na comparação: a manual e a riscada com o rótulo do plano; o resto
 * veio da IA. A conferência (conferida ou conferir) é do plano atual e não vale aqui.
 */
export function origemNaComparacao(cena: Cena): Extract<OrigemNoPlano, 'manual' | 'riscada'> | null {
  if (cena.riscada) return 'riscada';
  if (cena.manual) return 'manual';
  return null;
}

const NOME_DO_CAMPO: Record<string, string> = {
  texto: 'texto',
  inicio: 'início',
  fim: 'fim',
  tipo: 'tipo',
  manual: 'manual',
  riscada: 'riscada',
  fonte: 'fonte',
  frase_da_fala: 'frase da fala',
  quem_disse: 'quem disse',
  frase_ancora: 'frase âncora',
  ancora_perdida: 'âncora perdida',
  retrato_url: 'retrato',
};

const comoValor = (valor: unknown): string | null => {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (typeof valor === 'number') return `${Number(valor.toFixed(2))}`;
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (typeof valor === 'string') return valor.length > 60 ? `“${valor.slice(0, 57)}…”` : `“${valor}”`;
  return null;
};

/** Um campo que mudou: "texto: “Tese” → “Antítese”"; valor composto (lista, objeto), só o nome. */
export function descreverCampo(campo: string, anterior: Cena, atual: Cena): string {
  const nome = NOME_DO_CAMPO[campo] ?? campo.replace(/_/g, ' ');
  const antes = comoValor(anterior[campo]);
  const agora = comoValor(atual[campo]);
  return antes !== null && agora !== null ? `${nome}: ${antes} → ${agora}` : nome;
}
