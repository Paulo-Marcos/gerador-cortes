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
