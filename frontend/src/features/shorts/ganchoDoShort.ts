// D-565: as regras do título-gancho, do lado da tela.
//
// O gancho é o cartão de 4 a 7 palavras que ocupa os primeiros segundos — os
// mesmos em que o espectador decide ficar ou passar, e em que mais de 60% dele
// assiste sem som.
//
// Ele NÃO é uma cena. As cenas (texto em qualquer momento, N vezes, por cima da
// fala que a legenda já escreve) saíram na D-560, e o interruptor delas
// (`CENAS_LIGADAS`) não tem nada a ver com este arquivo. Um letreiro na porta do
// cinema não é alguém acendendo a luz no meio do filme.
//
// Os números abaixo são cópias de `backend/app/domain/gancho_short.py`, porque
// os projetos não compartilham módulo — a mesma situação de `previaLegenda.ts`,
// e a mesma defesa: `ganchoDoShort.test.ts` LÊ aquele arquivo e compara. Se um
// lado mudar sozinho, o teste cai em vez de a tela mentir sobre o que o render
// vai fazer.

import type { CSSProperties } from 'react';

/** Espelha `PALAVRAS_MIN` em `backend/app/domain/gancho_short.py`. */
export const PALAVRAS_MIN = 4;

/** Espelha `PALAVRAS_MAX` em `backend/app/domain/gancho_short.py`. */
export const PALAVRAS_MAX = 7;

/** Espelha `MAX_CARACTERES` em `backend/app/domain/gancho_short.py`. */
export const MAX_CARACTERES = 90;

/** Espelha `DURACAO_PADRAO_SEG` em `backend/app/domain/gancho_short.py`. */
export const DURACAO_PADRAO_SEG = 2.5;

/** Espelha `DURACAO_MIN_SEG` em `backend/app/domain/gancho_short.py`. */
export const DURACAO_MIN_SEG = 1.5;

/** Espelha `DURACAO_MAX_SEG` em `backend/app/domain/gancho_short.py`. */
export const DURACAO_MAX_SEG = 5.0;

/** Espelha `MAX_VARIACOES` em `backend/app/domain/gancho_short.py`. */
export const MAX_VARIACOES = 6;

/** Passo do ajuste de duração, em segundos. */
export const DURACAO_PASSO_SEG = 0.5;

/** D-594: espelha `TAMANHO_PADRAO` em `backend/app/domain/gancho_short.py`. */
export const TAMANHO_PADRAO = 1.0;

/** D-594: espelha `TAMANHO_MIN` em `backend/app/domain/gancho_short.py`. */
export const TAMANHO_MIN = 0.7;

/** D-594: espelha `TAMANHO_MAX` em `backend/app/domain/gancho_short.py`. */
export const TAMANHO_MAX = 1.6;

/** Passo do ajuste de tamanho: 10% por clique, visível na prévia. */
export const TAMANHO_PASSO = 0.1;

/** A escala efetiva do corpo. Espelha `normalizar_tamanho`. */
export function tamanhoEfetivo(tamanho: number | null | undefined): number {
  if (typeof tamanho !== 'number' || !Number.isFinite(tamanho) || tamanho <= 0) {
    return TAMANHO_PADRAO;
  }
  return Math.round(Math.min(Math.max(tamanho, TAMANHO_MIN), TAMANHO_MAX) * 100) / 100;
}

// D-581: como o gancho se separa do quadro.
//
// O problema que originou isto: gancho branco e legenda branca no mesmo quadro,
// ao mesmo tempo, com o mesmo peso — "dá conflito". A safe zone já separa os
// dois no ESPAÇO (ele no terço superior, ela no rodapé); o que faltava era
// separá-los na APARÊNCIA.
//
// Espelha `REALCES` em `backend/app/domain/gancho_short.py`, e o CSS espelha
// `estiloDoRealce` do `GanchoAbertura.tsx` do renderer. Três cópias parece
// muito — é o preço de os projetos não compartilharem módulo, e o teto contra a
// divergência é o `ganchoDoShort.test.ts`, que lê o arquivo do backend.
export type RealceDoGancho = 'veu' | 'caixa' | 'contorno' | 'sombra' | 'nenhum';

export const REALCE_PADRAO: RealceDoGancho = 'veu';

export const REALCES_DO_GANCHO: readonly {
  id: RealceDoGancho;
  nome: string;
  nota: string;
}[] = [
  { id: 'veu', nome: 'Véu', nota: 'escurece o topo — o padrão, bom em quase tudo' },
  { id: 'contorno', nome: 'Contorno', nota: 'halo preto na letra — o mais seguro se o fundo muda' },
  { id: 'caixa', nome: 'Caixa', nota: 'etiqueta preta atrás — o mais legível em imagem suja' },
  { id: 'sombra', nome: 'Sombra', nota: 'discreto — para quadro limpo' },
  { id: 'nenhum', nome: 'Nenhum', nota: 'só a cor separa — use com cor forte' },
];

// As cores oferecidas ao gancho. Mesma regra do catálogo da legenda: o que se
// grava é o HEX, não a chave — o renderer recebe a cor pronta e não precisa
// manter uma tabela igual a esta.
//
// A lista abre com o branco porque ele é o de sempre, e a ordem seguinte é a de
// quem mais se separa de uma legenda branca: amarelo e laranja são os que o
// formato consagrou para "isto aqui é a promessa".
export const CORES_DO_GANCHO: readonly { hex: string; nome: string }[] = [
  { hex: '', nome: 'branco (padrão)' },
  { hex: '#facc15', nome: 'amarelo' },
  { hex: '#ff8a3d', nome: 'laranja' },
  { hex: '#9bcfe3', nome: 'azul do HUD' },
  { hex: '#6aaa84', nome: 'verde do palco' },
  { hex: '#ff5a72', nome: 'rosa' },
  { hex: '#c9a4ff', nome: 'lilás' },
  { hex: '#111111', nome: 'preto (use com caixa clara)' },
];

/** O realce gravado, ou o padrão quando o valor não é um dos conhecidos. */
export function realceValido(valor: string | null | undefined): RealceDoGancho {
  const id = (valor ?? '').trim().toLowerCase() as RealceDoGancho;
  return REALCES_DO_GANCHO.some((r) => r.id === id) ? id : REALCE_PADRAO;
}

/** O que o realce desenha: um véu atrás, e/ou estilo sobre as letras. */
export interface EstiloDoRealce {
  /** O degradê de topo entra? Só o `veu` o usa. */
  veu: boolean;
  /** O que se aplica ao parágrafo. */
  texto: CSSProperties;
}

/**
 * O realce traduzido em CSS — o espelho de `estiloDoRealce` do renderer.
 *
 * `corpoPx` é o tamanho real do texto NA TELA em que ele está sendo desenhado,
 * e não o do arquivo: a espessura do contorno e o respiro da caixa saem dele.
 * Um contorno de 6px é halo num quadro de 1920 e mancha numa prévia de 300px —
 * foi por não derivar do corpo que a legenda passou anos mostrando um tamanho
 * que o arquivo não tinha (D-568).
 */
export function estiloDoRealce(
  realce: string | null | undefined,
  corpoPx: number,
): EstiloDoRealce {
  const traco = Math.max(1, Math.round(corpoPx * 0.055));

  switch (realceValido(realce)) {
    case 'caixa':
      return {
        veu: false,
        texto: {
          backgroundColor: 'rgba(0,0,0,0.78)',
          padding: `${Math.round(corpoPx * 0.16)}px ${Math.round(corpoPx * 0.3)}px`,
          borderRadius: Math.round(corpoPx * 0.16),
          // A caixa abraça CADA linha em vez de virar um retângulo só com
          // buracos nas pontas — é o que dá o desenho de etiqueta.
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          display: 'inline',
        } as CSSProperties,
      };

    case 'contorno':
      return {
        veu: false,
        texto: {
          WebkitTextStroke: `${traco}px rgba(0,0,0,0.92)`,
          // Sem `paint-order` o traço come metade da espessura por dentro e a
          // letra afina — visível justamente nas fontes pesadas do formato.
          paintOrder: 'stroke fill',
          textShadow: '0 4px 16px rgba(0,0,0,0.5)',
        } as CSSProperties,
      };

    case 'sombra':
      return {
        veu: false,
        texto: { textShadow: '0 6px 28px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.7)' },
      };

    case 'nenhum':
      return { veu: false, texto: {} };

    default:
      return { veu: true, texto: { textShadow: '0 6px 28px rgba(0,0,0,0.7)' } };
  }
}

export type TomDoGancho = 'vazio' | 'curto' | 'ideal' | 'longo';

export function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Como a tela julga o tamanho do gancho.
 *
 * É semáforo, não trava: `longo` continua salvável. A faixa de 4 a 7 palavras é
 * o que a prática de mercado converge, mas o operador viu o trecho e tem o
 * direito de discordar — mesma postura das bordas do candidato, que valem
 * contra o bruto e não contra a faixa da skill.
 */
export function tomDoGancho(texto: string): TomDoGancho {
  const palavras = contarPalavras(texto);
  if (palavras === 0) return 'vazio';
  if (palavras < PALAVRAS_MIN) return 'curto';
  if (palavras > PALAVRAS_MAX) return 'longo';
  return 'ideal';
}

/** O recado de uma linha que acompanha o contador. */
export function recadoDoTom(tom: TomDoGancho): string {
  switch (tom) {
    case 'vazio':
      return 'Sem gancho: o short abre direto no vídeo, como antes.';
    case 'curto':
      return `Curto — abaixo de ${PALAVRAS_MIN} palavras costuma faltar promessa.`;
    case 'longo':
      return `Longo — acima de ${PALAVRAS_MAX} palavras não se lê em ${DURACAO_PADRAO_SEG}s.`;
    case 'ideal':
      return 'No ponto: dá para ler numa sacada, sem prender o olho.';
  }
}

/** A duração efetiva em tela, encaixada na faixa útil. Espelha `normalizar_duracao`. */
export function duracaoEfetiva(ateSeg: number | null | undefined): number {
  if (typeof ateSeg !== 'number' || !Number.isFinite(ateSeg) || ateSeg <= 0) {
    return DURACAO_PADRAO_SEG;
  }
  return Math.min(Math.max(ateSeg, DURACAO_MIN_SEG), DURACAO_MAX_SEG);
}

/**
 * Quanto tempo o gancho fica em tela NESTE short.
 *
 * O operador encurta as bordas do trecho depois de escrever o gancho; sem este
 * corte, um trecho de 2s com gancho de 2,5s pediria ao Remotion uma sequência
 * maior que a composição. Espelha o corte de `para_payload` no domínio.
 */
export function duracaoNoShort(ateSeg: number | null | undefined, duracaoShortSeg: number): number {
  const desejada = duracaoEfetiva(ateSeg);
  if (!Number.isFinite(duracaoShortSeg) || duracaoShortSeg <= 0) return desejada;
  return Math.min(desejada, duracaoShortSeg);
}

/** O gancho está em tela neste instante do short (0 = início do trecho). */
export function ganchoVisivelEm(
  segundoNoShort: number,
  ateSeg: number | null | undefined,
  duracaoShortSeg: number,
): boolean {
  return segundoNoShort >= 0 && segundoNoShort < duracaoNoShort(ateSeg, duracaoShortSeg);
}
