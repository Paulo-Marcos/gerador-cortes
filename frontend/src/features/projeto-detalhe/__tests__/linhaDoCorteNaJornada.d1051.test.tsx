import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { FIRES_KEY } from '@/features/shorts/useFires';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';
import { useFocoDaLinhaNaUrl } from '../useFocoDaLinhaNaUrl';

// D-1051: a linha do corte é a ponta do caminho nos dois sentidos: leva aos shorts dele
// e recebe quem volta do Fire.

const corte = (mudancas: Partial<Corte>) =>
  ({ id: 'c9', numero: 9, status: 'aprovado', titulo_proposto: 'Corte', inicio_seg: 0, fim_seg: 10, desvios: [], ...mudancas }) as Corte;

const propsDaLinha = (c: Corte) => ({
  projetoId: 'p1',
  corte: c,
  status: statusExportPendente({ corte_id: 'c9', numero: 9, titulo: 'Corte' }),
  podeSubir: false,
  podeDescer: false,
  reordenando: false,
  onMover: vi.fn(),
  onEnviarYoutube: vi.fn(),
  onInformarUrl: vi.fn(),
  onLiberarPublicacao: vi.fn(),
  enviando: false,
});

function comProvedores(arvore: ReactElement, rota = '/projetos/p1') {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(FIRES_KEY, {
    fires: [{ corte_id: 'c9', shorts: { total: 5, rejeitado: 0 } }],
  });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[rota]}>{arvore}</MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('D-1051 · a linha do corte leva aos shorts', () => {
  const linha = (c: Corte) => renderToStaticMarkup(comProvedores(<CorteLinhaAp {...propsDaLinha(c)} />));

  it('corte com Fire: "Shorts deste corte (5)", na curadoria dele', () => {
    const html = linha(corte({ is_fire: true }));
    expect(html).toContain('Shorts deste corte (5)');
    expect(html).toContain('href="/shorts/c9"');
  });

  it('corte sem Fire: sem o caminho', () => {
    expect(linha(corte({ is_fire: false }))).not.toContain('Shorts deste corte');
  });
});

describe('D-1051 · quem volta do Fire chega à linha do corte', () => {
  let limpar: () => Promise<void> = async () => undefined;
  afterEach(async () => {
    await limpar();
    limpar = async () => undefined;
  });

  async function abrir(rota: string, corteId = 'c9') {
    const linhaDaTela = { scrollIntoView: vi.fn(), focus: vi.fn() };
    function Sonda() {
      const ref = useFocoDaLinhaNaUrl(corteId);
      ref.current = linhaDaTela as unknown as HTMLElement;
      return null;
    }
    ({ limpar } = montar(
      <MemoryRouter initialEntries={[rota]}>
        <Sonda />
      </MemoryRouter>,
    ));
    await assentar();
    return linhaDaTela;
  }

  it('a linha do corte da URL vem à vista e recebe o foco', async () => {
    const linha = await abrir('/projetos/p1?corte=c9');
    expect(linha.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(linha.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('as outras linhas ficam quietas', async () => {
    const linha = await abrir('/projetos/p1?corte=outro');
    expect(linha.scrollIntoView).not.toHaveBeenCalled();
    expect(linha.focus).not.toHaveBeenCalled();
  });

  it('sem corte na URL, ninguém rouba o foco', async () => {
    const linha = await abrir('/projetos/p1');
    expect(linha.focus).not.toHaveBeenCalled();
  });

  it('o <article> da linha recebe o ref do foco', () => {
    let artigo: ReactElement<{ ref?: { current: unknown } }> | undefined;
    const Sonda = () => {
      artigo = CorteLinhaAp(propsDaLinha(corte({}))) as ReactElement<{ ref?: { current: unknown } }>;
      return null;
    };
    renderToStaticMarkup(comProvedores(<Sonda />));
    expect(artigo?.type).toBe('article');
    expect(artigo?.props.ref).toHaveProperty('current');
  });
});
