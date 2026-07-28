/**
 * D-067: a cena `destaque_numerico` estourava o layout quando o número era
 * grande ("1.000.000", "45 anos") — corpo fixo em 360px. Agora o corpo é
 * derivado do comprimento do texto FINAL para caber no anel reticle.
 *
 * Estes testes blindam a regra pura `numeroFontSize`: números curtos mantêm o
 * corpo homologado; números longos encolhem até caber sem nunca furar o piso.
 */
import { describe, expect, it } from 'vitest';
import {
  analisarNumeroDestaque,
  formatarNucleoDestaque,
  numeroFontSize,
} from '@video-renderer/cenas-v2/_shared/numeroFit';

const BASE = 360;
const MIN = 96;
const MAX_WIDTH = 660;
const GLYPH_RATIO = 0.6;

/** Largura estimada pela mesma heurística do helper. */
function larguraEstimada(texto: string, size: number) {
  return [...texto].length * GLYPH_RATIO * size;
}

describe('numeroFontSize', () => {
  it('mantém o corpo base para números curtos', () => {
    expect(numeroFontSize('3')).toBe(BASE);
    expect(numeroFontSize('45')).toBe(BASE);
    expect(numeroFontSize('100')).toBe(BASE);
  });

  it('reduz o corpo para números grandes, cabendo na largura útil', () => {
    const size = numeroFontSize('1.000.000');
    expect(size).toBeLessThan(BASE);
    expect(larguraEstimada('1.000.000', size)).toBeLessThanOrEqual(MAX_WIDTH + 1);
  });

  it('reduz o corpo quando há sufixo textual ("45 anos")', () => {
    const size = numeroFontSize('45 anos');
    expect(size).toBeLessThan(BASE);
    expect(larguraEstimada('45 anos', size)).toBeLessThanOrEqual(MAX_WIDTH + 1);
  });

  it('é monotônico: quanto mais longo o texto, menor (ou igual) o corpo', () => {
    const curto = numeroFontSize('1.000');
    const medio = numeroFontSize('1.000.000');
    const longo = numeroFontSize('1.000.000.000');
    expect(curto).toBeGreaterThanOrEqual(medio);
    expect(medio).toBeGreaterThanOrEqual(longo);
  });

  it('nunca cai abaixo do piso, mesmo para valores absurdamente longos', () => {
    expect(numeroFontSize('1.000.000.000.000.000')).toBeGreaterThanOrEqual(MIN);
  });

  it('respeita opções customizadas de base, piso e largura', () => {
    expect(numeroFontSize('1', { baseSize: 200 })).toBe(200);
    expect(numeroFontSize('aaaaaaaaaaaaaaaaaaaa', { minSize: 50 })).toBeGreaterThanOrEqual(50);
    expect(numeroFontSize('12345', { maxWidth: 9999 })).toBe(BASE);
  });

  it('trata texto vazio sem quebrar (retorna o corpo base)', () => {
    expect(numeroFontSize('')).toBe(BASE);
  });
});

/**
 * D-429: a leitura antiga reduzia o token a `Number(raw.replace(/[^\d.-]/g,''))`
 * só para animar a contagem, e corrompia ~1/3 das cenas reais do canal. Os casos
 * abaixo são valores colhidos do banco de producao.
 */
describe('analisarNumeroDestaque', () => {
  /** O que o espectador ve quando a contagem termina. */
  const exibido = (bruto: unknown) => {
    const n = analisarNumeroDestaque(bruto);
    return n.valor === null
      ? n.textoFinal
      : `${n.prefixo}${formatarNucleoDestaque(n.valor, n)}${n.sufixo}`;
  };

  it.each([
    ['1,5 milhão', '1,5 milhão'], // antes: "15 milhão"
    ['40.000', '40.000'], //          antes: "40"
    ['600.000+', '600.000+'], //      antes: "600+"
    ['R$ 100', 'R$ 100'], //          antes: "100R$ "
    ['45,7%', '45,7%'], //            antes: "457%"
    ['25% ao mês', '25% ao mês'],
    ['12 milhões', '12 milhões'],
    ['1888', '1888'], //              antes: "1.888"
    ['2ª', '2ª'],
    ['Top 10', 'Top 10'], //          antes: "10Top "
  ])('preserva o token escrito pela IA: %s', (bruto, esperado) => {
    expect(exibido(bruto)).toBe(esperado);
  });

  it.each([
    ['15/09/1850'], // data
    ['6x1'], //       escala
    ['250 vs 100'], // comparacao
    ['2:1 a 3:1'], // proporcao
    ['Plano Real'], // texto puro
  ])('exibe literalmente e nao anima quando nao ha nucleo unico: %s', (bruto) => {
    expect(analisarNumeroDestaque(bruto).valor).toBeNull();
    expect(exibido(bruto)).toBe(bruto);
  });

  it('formata numero JSON grande com separador de milhar', () => {
    expect(exibido(12000000)).toBe('12.000.000');
    expect(exibido(600000)).toBe('600.000');
  });

  it('trata inteiro de 4 digitos na faixa de ano como ano (sem separador)', () => {
    expect(exibido(1914)).toBe('1914');
    expect(exibido(2007)).toBe('2007');
    expect(exibido(8000)).toBe('8.000');
  });

  it('preserva a casa decimal do numero JSON (antes o Math.round comia)', () => {
    expect(exibido(64.5)).toBe('64,5');
  });

  it('mantem o nucleo disponivel para a contagem, com prefixo e sufixo isolados', () => {
    const n = analisarNumeroDestaque('R$ 1,5 milhão');
    expect(n.valor).toBe(1.5);
    expect(n.prefixo).toBe('R$ ');
    expect(n.sufixo).toBe(' milhão');
    expect(n.casasDecimais).toBe(1);
    // O corpo da fonte usa o texto integral, nao so o nucleo.
    expect(n.textoFinal).toBe('R$ 1,5 milhão');
  });

  it('anima do zero ate o alvo sem perder o formato', () => {
    const n = analisarNumeroDestaque('40.000');
    expect(formatarNucleoDestaque(0, n)).toBe('0');
    expect(formatarNucleoDestaque(12345, n)).toBe('12.345');
  });

  it('nao quebra com valor ausente ou vazio', () => {
    expect(exibido('')).toBe('');
    expect(exibido(null)).toBe('');
    expect(exibido(undefined)).toBe('');
  });

  it('trata zero como valor animavel (antes caia no ramo de texto)', () => {
    expect(analisarNumeroDestaque(0).valor).toBe(0);
    expect(exibido(0)).toBe('0');
  });

  it('preserva o sinal negativo', () => {
    expect(exibido('-3,5%')).toBe('-3,5%');
  });
});
