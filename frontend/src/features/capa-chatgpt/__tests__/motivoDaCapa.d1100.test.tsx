import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PedidoCapaChatgpt } from '../api';
import { AndamentoDoPedido } from '../GerarNoChatGPT';

// D-1100: o backend passa a devolver o último pedido de cada capa mesmo depois de
// reiniciar. O que fecha o defeito é o motivo chegar ao card: sem isso, a capa
// vertical do TikTok fica faltando sem explicação, e a RN-26 segura a publicação.

const RECUSADO: PedidoCapaChatgpt = {
  id: 'p1',
  destino: 'tiktok',
  alvo_id: '81161dfd',
  corte_id: '81161dfd',
  estado: 'erro',
  etapa: 'Esperando o ChatGPT desenhar',
  erro: 'O ChatGPT respondeu sem imagem — recusa ou limite do plano. A resposta está na janela do robô.',
};

describe('o motivo gravado da capa aparece no card', () => {
  it('a recusa do ChatGPT diz em que passo parou e por quê', () => {
    const html = renderToStaticMarkup(<AndamentoDoPedido pedido={RECUSADO} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Parou em “Esperando o ChatGPT desenhar”');
    expect(html).toContain('recusa ou limite do plano');
  });

  it('o pedido que o reinício interrompeu pede para tentar de novo, e não diz que está gerando', () => {
    const interrompido: PedidoCapaChatgpt = {
      ...RECUSADO,
      etapa: 'Abrindo o projeto no ChatGPT',
      erro: 'O app reiniciou antes de a capa ficar pronta, e o pedido se perdeu. Peça de novo.',
    };
    const html = renderToStaticMarkup(<AndamentoDoPedido pedido={interrompido} />);
    expect(html).toContain('Peça de novo.');
    expect(html).not.toContain('acompanhe na janela do Edge');
  });
});
