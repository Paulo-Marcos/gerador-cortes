import { describe, expect, it } from 'vitest';
import {
  PRAZO_DA_ESPERA_MS,
  assinaturaDasVersoes,
  esperaTerminou,
  type EsperaDeVersoes,
} from '../FiltroTestePanel';
import type { VersaoExport } from '@/types/models';

// D-658: a aba de Filtros só consulta a lista entre o pedido da prévia e a
// chegada. "Chegada" é o arquivo PARAR de crescer — o ffmpeg cria o
// `preview.mp4` no primeiro segundo e escreve nele até o fim.

const versao = (filtro: string, tamanho_mb: number): VersaoExport => ({
  filtro,
  nome: filtro,
  e_preview: true,
  completo_disponivel: false,
  tamanho_mb,
});

const AGORA = 1_000_000;

function esperaPor(filtros: string[], noPedido: VersaoExport[] = []): EsperaDeVersoes {
  return {
    filtros,
    assinatura: assinaturaDasVersoes(noPedido),
    ate: AGORA + PRAZO_DA_ESPERA_MS,
  };
}

describe('espera da prévia (D-658)', () => {
  it('arquivo que acabou de surgir ainda não é prévia pronta', () => {
    const espera = esperaPor(['leve']);
    const agora = [versao('leve', 0.3)];

    // primeira vez que aparece: não há leitura anterior igual
    expect(esperaTerminou(espera, agora, assinaturaDasVersoes([]), AGORA)).toBe(false);
  });

  it('arquivo ainda crescendo mantém a espera', () => {
    const espera = esperaPor(['leve']);
    const antes = assinaturaDasVersoes([versao('leve', 0.3)]);

    expect(esperaTerminou(espera, [versao('leve', 0.6)], antes, AGORA)).toBe(false);
  });

  it('tamanho estável entre duas leituras encerra a espera', () => {
    const espera = esperaPor(['leve']);
    const pronta = [versao('leve', 0.9)];

    expect(esperaTerminou(espera, pronta, assinaturaDasVersoes(pronta), AGORA)).toBe(true);
  });

  it('lista igual à do pedido não conta como chegada (nada foi gerado ainda)', () => {
    const existente = [versao('leve', 0.9)];
    const espera = esperaPor(['leve'], existente);

    expect(esperaTerminou(espera, existente, assinaturaDasVersoes(existente), AGORA)).toBe(false);
  });

  it('"todos" só encerra com todos os filtros pedidos na lista', () => {
    const espera = esperaPor(['leve', 'completo']);
    const parcial = [versao('leve', 0.9)];

    expect(esperaTerminou(espera, parcial, assinaturaDasVersoes(parcial), AGORA)).toBe(false);
  });

  it('o prazo encerra mesmo sem a prévia chegar', () => {
    const espera = esperaPor(['leve']);

    expect(esperaTerminou(espera, [], null, AGORA + PRAZO_DA_ESPERA_MS)).toBe(true);
  });
});
