import { describe, expect, it } from 'vitest';
import type { PedidoCapaChatgpt } from '../api';
import { pedidoEmVoo, terminouAgora } from '../useCapaNoChatGPT';

// D-898: a capa relê quando ESTA tela vê o robô terminar — e só aí.

const pedido = (estado: PedidoCapaChatgpt['estado'], id = 'p1'): PedidoCapaChatgpt => ({
  id,
  destino: 'youtube',
  alvo_id: 'c1',
  corte_id: 'c1',
  estado,
  etapa: '',
  erro: '',
});

describe('pedido da capa', () => {
  it('na fila e rodando contam como em voo; pronto e erro não', () => {
    expect(pedidoEmVoo(pedido('aguardando'))).toBe(true);
    expect(pedidoEmVoo(pedido('rodando'))).toBe(true);
    expect(pedidoEmVoo(pedido('concluido'))).toBe(false);
    expect(pedidoEmVoo(pedido('erro'))).toBe(false);
    expect(pedidoEmVoo(null)).toBe(false);
  });

  it('terminou agora quando o mesmo pedido sai de em voo para pronto', () => {
    expect(terminouAgora(pedido('rodando'), pedido('concluido'))).toBe(true);
    expect(terminouAgora(pedido('aguardando'), pedido('concluido'))).toBe(true);
  });

  it('pedido que já chegou pronto, que parou ou que é outro não relê', () => {
    expect(terminouAgora(undefined, pedido('concluido'))).toBe(false);
    expect(terminouAgora(pedido('concluido'), pedido('concluido'))).toBe(false);
    expect(terminouAgora(pedido('rodando'), pedido('erro'))).toBe(false);
    expect(terminouAgora(pedido('rodando', 'velho'), pedido('concluido', 'novo'))).toBe(false);
  });
});
