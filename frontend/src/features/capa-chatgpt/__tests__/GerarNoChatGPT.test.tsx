import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfiguracaoCapaChatgpt, PedidoCapaChatgpt, PessoaDaCapa } from '../api';
import { comPessoa, fotosQueVao, GerarNoChatGPT, semPessoa } from '../GerarNoChatGPT';
import { pedidoKey } from '../useCapaNoChatGPT';

// D-804: o botão só habilita quando há onde gerar (o projeto) e o que mandar (o
// prompt) — e, quando não habilita, o title diz o que falta.

const PROJETO = 'https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project';

function renderizar(
  projetoUrl: string,
  prompt?: string,
  elenco?: PessoaDaCapa[],
  pedido?: Partial<PedidoCapaChatgpt>,
  promptDoPedido = prompt?.trim() ?? '',
) {
  const qc = new QueryClient();
  const config: ConfiguracaoCapaChatgpt = { projeto_url: projetoUrl, fichas: [], maximo_de_fichas: 10 };
  qc.setQueryData(['capa-chatgpt', 'configuracao'], config);
  if (pedido) {
    qc.setQueryData(pedidoKey('youtube', 'c1', promptDoPedido), {
      id: 'p1', destino: 'youtube', alvo_id: 'c1', corte_id: 'c1', etapa: '', erro: '', estado: 'aguardando',
      ...pedido,
    });
  }
  if (elenco) qc.setQueryData(['capa-chatgpt', 'elenco', prompt?.trim()], elenco);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GerarNoChatGPT prompt={prompt} destino="youtube" alvoId="c1" />
    </QueryClientProvider>,
  );
}

describe('GerarNoChatGPT', () => {
  it('com projeto e prompt, habilita', () => {
    const html = renderizar(PROJETO, 'o sapo aponta');
    expect(html).toContain('Gerar no ChatGPT');
    expect(html).not.toContain('disabled');
    expect(html).toContain('imagem 16:9');
  });

  // D-898: o andamento mora no backend — reabrir o modal mostra onde o robô
  // está, e o motivo de uma parada não some mais com o modal.
  it('pedido na fila trava o botão e diz que está na fila', () => {
    const html = renderizar(PROJETO, 'o sapo aponta', undefined, { estado: 'aguardando' });
    expect(html).toContain('disabled');
    expect(html).toContain('Na fila do ChatGPT');
  });

  it('pedido rodando mostra o passo do robô', () => {
    const html = renderizar(PROJETO, 'o sapo aponta', undefined, {
      estado: 'rodando',
      etapa: 'Esperando o ChatGPT desenhar',
    });
    expect(html).toContain('Esperando o ChatGPT desenhar');
    expect(html).toContain('Gerando no ChatGPT');
  });

  // pr-audit do #153: o pedido tirado da fila pela Fila global não pode
  // continuar dizendo "acompanhe na janela do Edge".
  it('pedido cancelado na fila diz isso e libera o botão', () => {
    const html = renderizar(PROJETO, 'o sapo aponta', undefined, {
      estado: 'cancelado',
      etapa: 'Cancelado na fila',
    });
    expect(html).toContain('Cancelado na fila');
    expect(html).not.toContain('janela do Edge');
    expect(html).not.toContain('disabled');
  });

  // D-899: "Gerar prompt" põe a imagem na fila pelo backend; o que a tela sabia
  // do prompt anterior não vale para o novo — ela relê em vez de mostrar.
  it('prompt novo não herda o andamento do prompt anterior', () => {
    const html = renderizar(PROJETO, 'o prompt novo', undefined, { estado: 'erro', erro: 'velho' }, 'o antigo');
    expect(html).not.toContain('velho');
    expect(html).not.toContain('disabled');
  });

  it('pedido que parou mostra onde e por quê, e deixa pedir de novo', () => {
    const html = renderizar(PROJETO, 'o sapo aponta', undefined, {
      estado: 'erro',
      etapa: 'Esperando o ChatGPT desenhar',
      erro: 'O ChatGPT respondeu sem imagem.',
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('O ChatGPT respondeu sem imagem.');
    expect(html).not.toContain('disabled');
  });

  it('sem projeto configurado, manda para Canais', () => {
    const html = renderizar('', 'o sapo aponta');
    expect(html).toContain('disabled');
    expect(html).toContain('Canais → Capas no ChatGPT');
  });

  it('sem prompt, pede o prompt antes', () => {
    const html = renderizar(PROJETO, '   ');
    expect(html).toContain('disabled');
    expect(html).toContain('Gere o prompt da capa primeiro');
  });
});

// D-840: a foto de cada pessoa real vai junto das fichas, e o operador confere
// o elenco antes de gerar.
describe('elenco da capa', () => {
  const NEYMAR = { nome: 'Neymar', slug: 'neymar' };
  const SEM_FOTO = { nome: 'Fulano', slug: null };

  it('mostra a foto de quem tem e avisa quem está sem', () => {
    const html = renderizar(PROJETO, 'o sapo e o Neymar', [NEYMAR, SEM_FOTO]);
    expect(html).toContain('Pessoas na capa');
    expect(html).toContain('/api/retratos/neymar?v=');
    expect(html).toContain('Trocar a foto de Neymar');
    expect(html).toContain('Subir uma foto de Fulano');
    expect(html).toContain('sem foto');
    expect(html).toContain('Tirar Neymar da capa');
  });

  it('sem projeto configurado, não oferece elenco', () => {
    expect(renderizar('', 'o sapo', [NEYMAR])).not.toContain('Pessoas na capa');
  });

  it('só quem tem foto vai para o robô; elenco que não chegou fica com o backend', () => {
    expect(fotosQueVao([NEYMAR, SEM_FOTO])).toEqual(['Neymar']);
    expect(fotosQueVao([])).toEqual([]);
    expect(fotosQueVao(undefined)).toBeUndefined();
  });

  it('foto nova substitui a pessoa do mesmo nome; nome novo entra no fim', () => {
    const trocado = comPessoa([SEM_FOTO, NEYMAR], { nome: 'fulano', slug: 'fulano' });
    expect(trocado).toEqual([{ nome: 'fulano', slug: 'fulano' }, NEYMAR]);
    expect(comPessoa([NEYMAR], SEM_FOTO)).toEqual([NEYMAR, SEM_FOTO]);
    expect(semPessoa([NEYMAR, SEM_FOTO], 'Neymar')).toEqual([SEM_FOTO]);
  });
});
