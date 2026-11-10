import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MudancasPorOrigem } from '@/features/analises/MudancasPorOrigem';
import { MotivosDeExclusaoSection } from '../MotivosDeExclusaoSection';
import { CHAVE_MOTIVOS_DE_EXCLUSAO } from '../useMotivosDeExclusao';

/**
 * D-1006. Os motivos de excluir são do canal: a tela de Canais acrescenta e
 * esconde; o aviso do corte riscado oferece só os visíveis (D-1096, em
 * `riscarNaLinha.d1096` e `useRiscarCorte.d1088`); as análises nomeiam
 * todos, inclusive o escondido.
 */
const LISTA = {
  personalizado: true,
  motivos: [
    { slug: 'tema_fraco', rotulo: 'Tema não rende', ativo: true },
    { slug: 'repetido', rotulo: 'Repete outro corte', ativo: false },
    { slug: 'polemico', rotulo: 'Polêmico', ativo: true },
  ],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function telaDeCanais(): string {
  const cliente = new QueryClient();
  cliente.setQueryData(CHAVE_MOTIVOS_DE_EXCLUSAO, LISTA);
  return renderToStaticMarkup(
    <QueryClientProvider client={cliente}>
      <MotivosDeExclusaoSection />
    </QueryClientProvider>,
  );
}

describe('a seção de motivos na tela de Canais', () => {
  it('lista todos, com Esconder no visível e Mostrar no escondido', () => {
    const html = telaDeCanais();

    expect(html).toContain('Motivos de excluir um corte');
    expect(html).toContain('aria-label="Esconder o motivo Tema não rende"');
    expect(html).toContain('aria-label="Mostrar o motivo Repete outro corte"');
    expect(html).toMatch(/line-through[^>]*>Repete outro corte/);
    expect(html).toContain('aria-label="Nome do motivo novo"');
  });
});

describe('as análises nomeiam o motivo escondido e o novo', () => {
  it('a contagem sai com o nome que o canal deu', () => {
    const html = renderToStaticMarkup(
      <MudancasPorOrigem
        motivos={LISTA.motivos}
        grupos={[
          {
            origem: 'claude',
            cortes: 1,
            sem_mudanca: 1,
            por_tipo: {},
            apagados: { total: 2, por_motivo: { tema_fraco: 0, repetido: 1, polemico: 1, sem_motivo: 0 } },
          },
        ]}
      />,
    );

    expect(html).toContain('Repete outro corte 1 · Polêmico 1');
  });
});

describe('o cliente HTTP dos motivos', () => {
  async function pedidoDe(chamar: (api: typeof import('../api/motivosDeExclusao').motivosDeExclusaoApi) => Promise<unknown>) {
    const pedidos: Request[] = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        pedidos.push(pedido);
        return new Response(JSON.stringify(LISTA), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    const { motivosDeExclusaoApi } = await import('../api/motivosDeExclusao');
    await chamar(motivosDeExclusaoApi);
    return { metodo: pedidos[0].method, url: pedidos[0].url, corpo: await pedidos[0].text() };
  }

  it('acrescentar manda o nome; o slug é do backend', async () => {
    expect(await pedidoDe((api) => api.acrescentar('Polêmico'))).toEqual({
      metodo: 'POST',
      url: 'http://api.test/api/channels/ativo/motivos-de-exclusao',
      corpo: '{"rotulo":"Polêmico"}',
    });
  });

  it('esconder manda o slug e ativo falso', async () => {
    expect(await pedidoDe((api) => api.mostrar('repetido', false))).toEqual({
      metodo: 'PUT',
      url: 'http://api.test/api/channels/ativo/motivos-de-exclusao/repetido',
      corpo: '{"ativo":false}',
    });
  });
});
