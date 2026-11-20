import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapaDaLive } from '@/components/ui/mapa-da-live';
import { rawEditorPath } from '@/features/post-production/postProductionNavigation';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { corteDaLive } from '@/upgrade/upgradeRoutes';
import { cortesDoMapa, estadoNoMapa, sobretituloDoCorte } from '../mapaDoEditor';

// D-1150 (E-069 H-17, DIRECAO §7.3): o mapa da live compacto, no cabeçalho do editor,
// é por onde se troca de corte. A lista lateral "Cortes da live" sai do editor; a Pós
// e a Revisão continuam com ela. O J/K não muda.

const navegar = vi.fn();
let publicado: Chrome | null = null;
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navegar,
}));
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosDeExclusao: () => ({ data: undefined }) }));

const { CabecalhoDoCorte } = await import('../CabecalhoDoCorte');
const { BancadaChrome } = await import('../BancadaChrome');

const corteDe = (id: string, numero: number, extra: Partial<Corte> = {}) =>
  ({
    id,
    numero,
    titulo_proposto: `Corte ${id}`,
    status: 'proposto',
    inicio_seg: numero * 600,
    fim_seg: numero * 600 + 420,
    motivo_riscado: [],
    ...extra,
  }) as unknown as Corte;

// a aprovado, b riscado, c proposto, d processado.
const CORTES = [
  corteDe('a', 1, { status: 'aprovado' }),
  corteDe('b', 2, { status: 'rejeitado' }),
  corteDe('c', 3),
  corteDe('d', 4, { status: 'processado' }),
];
const caminho = (c: Corte) => rawEditorPath('p1', c.id);

const props = (aberto: Corte, extra: Record<string, unknown> = {}) => ({
  projetoId: 'p1',
  tituloLive: 'Live 267',
  duracaoLiveSeg: 3600,
  cortes: CORTES,
  corte: aberto,
  caminhoDoCorte: caminho,
  comRiscados: true,
  ...extra,
});

function desenhar(aberto: Corte, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CabecalhoDoCorte {...props(aberto, extra)} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Acha, na árvore de elementos que o componente devolve, o primeiro do tipo pedido. */
function acharNaArvore(no: ReactNode, tipo: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = acharNaArvore(filho, tipo);
      if (achado) return achado;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(no)) return null;
  if (no.type === tipo) return no as ReactElement<Record<string, unknown>>;
  return acharNaArvore(no.props.children, tipo);
}

/** Os botões da árvore, pelo `aria-label`. */
function botaoDaArvore(no: ReactNode, rotulo: string): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = botaoDaArvore(filho, rotulo);
      if (achado) return achado;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(no)) return null;
  if (no.props['aria-label'] === rotulo) return no;
  return botaoDaArvore(no.props.children as ReactNode, rotulo);
}

beforeEach(() => navegar.mockClear());

describe('a luz de cada corte no mapa (§3.3)', () => {
  it('aprovado e processado acendem, proposto é vidro, riscado é tracejado', () => {
    expect(CORTES.map(estadoNoMapa)).toEqual(['pronto', 'riscado', 'proposto', 'pronto']);
  });

  it('cada pílula aponta para o editor do próprio corte, na posição em que nasceu', () => {
    const pilulas = cortesDoMapa(CORTES, caminho);
    expect(pilulas.map((p) => p.href)).toEqual(CORTES.map((c) => `/projetos/p1/cortes/${c.id}?fase=1`));
    expect(pilulas[2]).toMatchObject({ numero: 3, nome: 'Corte c', inicioSeg: 1800, fimSeg: 2220 });
  });
});

describe('o sobretítulo do cabeçalho', () => {
  it('conta só os vivos, como o J/K: "Corte 2 de 3 · Live"', () => {
    expect(sobretituloDoCorte(CORTES, CORTES[2], 'Live 267')).toBe('Corte 2 de 3 · Live 267');
    expect(sobretituloDoCorte(CORTES, CORTES[0], 'Live 267')).toBe('Corte 1 de 3 · Live 267');
  });

  it('aberto num riscado, diz que ele está riscado', () => {
    expect(sobretituloDoCorte(CORTES, CORTES[1], 'Live 267')).toBe('Corte #2, riscado · Live 267');
  });
});

describe('CabecalhoDoCorte', () => {
  it('mostra onde estou e o mapa compacto, com o corte aberto no feixe', () => {
    const html = desenhar(CORTES[2]);
    expect(html).toContain('Corte 2 de 3 · Live 267');
    expect(html).toMatch(/<h2[^>]*>Corte c<\/h2>/);
    expect(html).toContain('aria-label="Mapa da live"');
    expect(html).toContain('data-tamanho="mini"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-corte="c"[^>]*aria-current="true"/);
    // As quatro pílulas, inclusive a riscada: o riscado aparece apagado, não some.
    expect(html.match(/data-corte="/g)).toHaveLength(4);
    expect(html).toMatch(/data-corte="b"[^>]*data-estado="riscado"/);
  });

  it('clicar num corte do mapa troca de corte pela rota da mesma tela', () => {
    const arvore = CabecalhoDoCorte(props(CORTES[2]));
    const mapa = acharNaArvore(arvore, MapaDaLive)!;
    expect(mapa.props.abertoId).toBe('c');
    (mapa.props.onAbrir as (id: string) => void)('d');
    expect(navegar).toHaveBeenCalledWith('/projetos/p1/cortes/d?fase=1');
    // Clicar no corte aberto não navega para ele mesmo.
    navegar.mockClear();
    (mapa.props.onAbrir as (id: string) => void)('c');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('a rota nova é outro corte para o UmaTelaPorCorte: a tela remonta (D-1033)', () => {
    const [de, para] = [caminho(CORTES[2]), caminho(CORTES[3])].map((r) => {
      const [pathname, search] = r.split('?');
      return corteDaLive(pathname, `?${search}`);
    });
    expect(de).toBe('c');
    expect(para).toBe('d');
  });

  it('as setas são o J/K: pulam o riscado e têm a tecla anunciada', () => {
    const arvore = CabecalhoDoCorte(props(CORTES[0]));
    (botaoDaArvore(arvore, 'Próximo corte')!.props.onClick as () => void)();
    expect(navegar).toHaveBeenLastCalledWith('/projetos/p1/cortes/c?fase=1');
    (botaoDaArvore(arvore, 'Corte anterior')!.props.onClick as () => void)();
    expect(navegar).toHaveBeenLastCalledWith('/projetos/p1/cortes/d?fase=1');
    const html = desenhar(CORTES[0]);
    expect(html).toMatch(/aria-label="Corte anterior"[^>]*aria-keyshortcuts="J"/);
    expect(html).toMatch(/aria-label="Próximo corte"[^>]*aria-keyshortcuts="K"/);
  });

  it('os riscados ficam a um clique, ao lado das setas, só na etapa Cortes (D-1092)', () => {
    expect(desenhar(CORTES[0])).toContain('Riscados · 1');
    expect(desenhar(CORTES[0], { comRiscados: false })).not.toContain('Riscados ·');
    expect(
      desenhar(CORTES[0], { cortes: CORTES.filter((c) => c.status !== 'rejeitado') }),
    ).not.toContain('Riscados ·');
  });

  it('título longo trunca em vez de empurrar o mapa', () => {
    const longo = corteDe('x', 1, { titulo_proposto: 'T'.repeat(120) });
    const html = desenhar(longo, { cortes: [longo] });
    expect(html).toMatch(/<div class="min-w-0 flex-1">/);
    expect(html).toMatch(/<h2 class="[^"]*truncate[^"]*"/);
  });
});

describe('a lista lateral sai do editor', () => {
  function publicar(semLista: boolean) {
    publicado = null;
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <BancadaChrome
            projetoId="p1"
            tituloLive="Live"
            cortes={CORTES}
            corte={CORTES[0]}
            exportStatus={[]}
            caminhoDoCorte={caminho}
            sub=""
            fire={false}
            sujo={false}
            salvando={false}
            brutoPronto
            brutoOcupado={false}
            onToggleFire={vi.fn()}
            onAprovar={vi.fn()}
            riscar={{ onRiscar: vi.fn() }}
            semLista={semLista}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return publicado!;
  }

  it('com `semLista` a casca não recebe a lista, mas o J/K continua (o `atual`)', () => {
    const chrome = publicar(true);
    expect(chrome.lista).toBeUndefined();
    expect(chrome.atual?.onProximo).toBeTypeOf('function');
    chrome.atual!.onProximo!();
    expect(navegar).toHaveBeenLastCalledWith('/projetos/p1/cortes/c?fase=1');
  });

  it('sem a lista a casca não injeta o lembrete do J/K: o editor o declara na barra', () => {
    expect(publicar(true).barra?.teclas?.[0]).toEqual({ teclas: ['J', 'K'], texto: 'trocar de corte' });
    expect(publicar(false).barra?.teclas?.some((t) => t.teclas.includes('J'))).toBe(false);
  });

  it('sem ele (Pós e Revisão), a lista segue como antes', () => {
    expect(publicar(false).lista?.itens.map((i) => i.id)).toEqual(['a', 'c', 'd']);
  });

  it('o editor pede o mapa e dispensa a lista', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const fonte = readFileSync(resolve(__dirname, '..', 'EditorPage.tsx'), 'utf8');
    expect(fonte).toMatch(/<BancadaChrome[\s\S]*?semLista[\s\S]*?\/>/);
    expect(fonte).toContain('<CabecalhoDoCorte');
    expect(fonte).toContain('duracaoLiveSeg={projeto.data?.duracao_segundos ?? 0}');
  });
});
