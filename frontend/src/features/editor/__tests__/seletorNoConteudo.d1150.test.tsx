import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Corte } from '@/types/models';
import { LinhaDoTopo } from '@/upgrade/LinhaDoTopo';
import { barraComTeclas, useAtalhosDaCasca } from '@/upgrade/useAtalhosDaCasca';
import { listaDoChrome, type Chrome } from '@/upgrade/UpgradeChrome';
import { RiscadosDaLista, SecaoDosRiscados, TRAZER_DE_VOLTA } from '../RiscadosDaLista';
import { assentar, montar } from './domMinimo';

// D-1150 (E-069 H-17, DIRECAO §7.3): no editor, ‹ › e o mapa moram no cabeçalho do
// corte. O seletor ‹ #N título › da linha do topo sai — sem mexer na casca: sem a
// `lista`, ela já não o desenha (`listaDoChrome` só devolve o `atual` junto da lista).
// O J/K continua, porque o atalho da casca lê o `chrome.atual` direto, e o lembrete
// "J K" vem do próprio editor. E o "Trazer de volta" dos riscados continua a um clique.

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
vi.mock('@/upgrade/apertoDaBarra', async (original) => ({
  ...(await original<typeof import('@/upgrade/apertoDaBarra')>()),
  useApertoDaBarra: () => ({ barra: { current: null }, trilha: { current: null }, espacador: { current: null }, nivel: 0 }),
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosDeExclusao: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');
const { CabecalhoDoCorte } = await import('../CabecalhoDoCorte');

const corteDe = (id: string, numero: number, status = 'proposto') =>
  ({ id, numero, titulo_proposto: `Corte ${id}`, status, inicio_seg: numero * 600, fim_seg: numero * 600 + 300, motivo_riscado: [] }) as unknown as Corte;
const CORTES = [corteDe('a', 1), corteDe('b', 2, 'rejeitado'), corteDe('c', 3)];
const caminho = (c: Corte) => `/projetos/p1/cortes/${c.id}?fase=1`;

function chromeDoEditor(): Chrome {
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
          semLista
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return publicado!;
}

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

let limpar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await limpar?.();
  limpar = null;
  navegar.mockClear();
});

describe('o seletor da linha do topo sai do editor', () => {
  it('a casca não recebe o `atual` para a linha do topo, então o ‹ #N título › não aparece', () => {
    const { atual } = listaDoChrome(chromeDoEditor());
    expect(atual).toBeUndefined();
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LinhaDoTopo trilha={[{ texto: 'Biblioteca', to: '/projetos' }, { texto: '#1' }]} titulo="Corte #1" atual={atual} />
      </MemoryRouter>,
    );
    expect(html).not.toContain('aria-label="Item anterior"');
    expect(html).not.toContain('aria-label="Próximo item"');
  });

  it('o J/K continua: a casca troca de corte pelo `chrome.atual` do editor, pulando o riscado', async () => {
    const chrome = chromeDoEditor();
    const ouvintes: Array<(e: unknown) => void> = [];
    function Sonda() {
      useAtalhosDaCasca(() => undefined, () => undefined, () => undefined, chrome);
      return null;
    }
    const tela = montar(<Sonda />);
    limpar = tela.limpar;
    const global = globalThis as Record<string, unknown>;
    global.addEventListener = (tipo: string, fn: (e: unknown) => void) => tipo === 'keydown' && ouvintes.push(fn);
    for (const nome of ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) global[nome] ??= class {};
    (global.document as Record<string, unknown>).querySelector = () => null;
    await assentar();
    const teclar = (key: string) =>
      ouvintes.at(-1)!({ key, metaKey: false, ctrlKey: false, altKey: false, target: null, defaultPrevented: false, preventDefault() {} });
    teclar('k');
    expect(navegar).toHaveBeenLastCalledWith('/projetos/p1/cortes/c?fase=1');
    teclar('j');
    expect(navegar).toHaveBeenLastCalledWith('/projetos/p1/cortes/c?fase=1');
    expect(navegar).toHaveBeenCalledTimes(2);
  });

  it('o lembrete "J K trocar de corte" segue na barra, mesmo sem o seletor', () => {
    const barra = barraComTeclas(chromeDoEditor().barra!, false);
    expect(barra.teclas?.[0]).toEqual({ teclas: ['J', 'K'], texto: 'trocar de corte' });
  });
});

describe('o "Trazer de volta" continua acessível (D-1092)', () => {
  const props = {
    projetoId: 'p1',
    tituloLive: 'Live',
    duracaoLiveSeg: 3600,
    cortes: CORTES,
    corte: CORTES[0],
    caminhoDoCorte: caminho,
    comRiscados: true,
  };

  it('o "Riscados · N" ao lado das setas abre a seção com os riscados da live', () => {
    const arvore = CabecalhoDoCorte(props);
    const gatilho = acharNaArvore(arvore, PopoverTrigger)!;
    expect(renderToStaticMarkup(<>{gatilho.props.children as ReactNode}</>)).toContain('Riscados · 1');
    const secao = acharNaArvore(acharNaArvore(arvore, PopoverContent), RiscadosDaLista)!;
    expect(secao.props.projetoId).toBe('p1');
    expect((secao.props.riscados as Corte[]).map((c) => c.id)).toEqual(['b']);
  });

  it('a seção traz o botão de trazer de volta, focável e com o próprio anel de foco', () => {
    const html = renderToStaticMarkup(<SecaoDosRiscados riscados={[CORTES[1]]} onTrazerDeVolta={vi.fn()} />);
    const botao = html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/)![0];
    expect(botao).toContain(TRAZER_DE_VOLTA);
    expect(botao).toContain('data-sala=""');
    expect(botao).toContain('focus-visible:outline-foco');
    expect(botao).not.toMatch(/\sdisabled=""/);
  });
});
