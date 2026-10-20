import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstiloDaCapaModal, ETIQUETA_DE_EXEMPLO } from '@/features/metadata/EstiloDaCapaModal';
import type { PainelDaCapa } from '@/features/metadata/estiloDaCapa';
import { EstiloPorTipo } from '../EstiloDoCanal';

// D-947: o modal "Estilizar capa" também abre pela tela de Canais, sem corte —
// a prévia vai sem a arte e com um texto de exemplo, e salvar grava no estilo
// do canal (o mesmo destino da capa de um corte).

const nada = () => undefined;
const faixa = (y: number) => ({ x: 50, y, w: 980, h: 100 });

function painel(): PainelDaCapa {
  return {
    salvo: { estilo: null, fundo: null, visiveis: null, posicoes: null },
    efetivo: {
      estilo: 'limpo',
      fundo: 'reticula-aurora',
      visiveis: { etiqueta: true, arte: true, selo: true, cabecalho: false, acento: false },
      faixas: { etiqueta: faixa(288), arte: faixa(512), selo: faixa(1560), cabecalho: faixa(176), acento: faixa(480) },
    },
    padrao: {},
    estilo_do_palco: 'limpo',
    fundo_do_atual: 'hud-forte',
    arte: '',
    cabecalho: { nome: 'Canal', handle: '@canal', imagem: '' },
    estilos: ['palco', 'atual', 'limpo'],
    fundos: ['reticula-aurora'],
    componentes: ['etiqueta', 'arte', 'selo', 'cabecalho', 'acento'],
    componentes_do_limpo: ['cabecalho', 'acento'],
    quadro: { largura: 1080, altura: 1920 },
    faixa_segura: { y: 288, h: 1344 },
    lado_minimo: 40,
  };
}

describe('Estilizar capa na tela de Canais (D-947)', () => {
  it('o bloco da capa tem o botão que abre o modal, sem pedir um corte', () => {
    const tela = renderToStaticMarkup(
      <EstiloPorTipo estilo="limpo" estiloDaCapa="palco" onEstilo={nada} onEstiloDaCapa={nada} onEditar={nada} />,
    );
    expect(tela).toContain('Estilizar capa');
    expect(tela).not.toContain('na capa de um corte.');
  });

  it('sem corte, o modal desenha o painel do canal e só grava o estilo', () => {
    const cliente = new QueryClient();
    cliente.setQueryData(['capa-tiktok-estilo', 'sem-corte'], painel());
    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente}>
        <EstiloDaCapaModal open onClose={nada} etiqueta={ETIQUETA_DE_EXEMPLO} />
      </QueryClientProvider>,
    );
    expect(html).toContain('Estilizar capa do TikTok');
    expect(html).toContain('Sem corte, a prévia vai sem a arte');
    expect(html).toContain('Salvar o estilo');
    expect(html).toContain('O palco do canal está no estilo');
    expect(html).not.toContain('deste corte');
    expect(html).not.toContain('carregando o estilo da capa');
  });
});

describe('estiloDaCapaApi sem corte (D-947)', () => {
  let chamadas: Request[] = [];

  beforeEach(() => {
    chamadas = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        chamadas.push(pedido);
        return Response.json({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const modulo = () => import('@/features/metadata/estiloDaCapaApi');

  it('o painel vai sem corte_id', async () => {
    await (await modulo()).estiloDaCapaApi.obter({});
    expect(chamadas[0].url).toBe('http://api.test/api/capa-tiktok/estilo');
  });

  it('prever e gravar mandam só o estilo', async () => {
    const { estiloDaCapaApi } = await modulo();
    await estiloDaCapaApi.prever({}, { estilo: 'atual' });
    await estiloDaCapaApi.gravar({}, { estilo: 'limpo' });
    expect(chamadas.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ['POST', '/api/capa-tiktok/estilo/previa'],
      ['PUT', '/api/capa-tiktok/estilo'],
    ]);
    expect(await chamadas[0].json()).toEqual({ estilo: { estilo: 'atual' } });
    expect(await chamadas[1].json()).toEqual({ estilo: { estilo: 'limpo' } });
  });

  it('com corte, o painel continua indo com corte_id', async () => {
    await (await modulo()).estiloDaCapaApi.obter({ corteId: 'c1' });
    expect(chamadas[0].url).toBe('http://api.test/api/capa-tiktok/estilo?corte_id=c1');
  });
});
