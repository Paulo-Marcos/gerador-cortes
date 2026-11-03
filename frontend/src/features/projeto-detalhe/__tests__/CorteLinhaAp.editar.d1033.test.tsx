import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-1033: trocar de corte deixou de escolher a tela pela etapa, mas quem clica
// "Editar" na lista da live pediu o editor, esteja o corte em que etapa estiver.
const navegar = vi.fn();
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navegar,
}));
vi.mock('@/upgrade/medidas', async (original) => ({
  ...(await original<typeof import('@/upgrade/medidas')>()),
  useJanelaMin: () => true,
}));
vi.mock('@/components/ui/overflow-menu', async (original) => ({
  ...(await original<typeof import('@/components/ui/overflow-menu')>()),
  OverflowMenu: () => null,
}));

type No = ReactElement<{ children?: unknown; onClick?: () => void }>;

function elementos(raiz: unknown): No[] {
  if (Array.isArray(raiz)) return raiz.flatMap(elementos);
  if (!raiz || typeof raiz !== 'object' || !('props' in raiz)) return [];
  const no = raiz as No;
  return [no, ...elementos(no.props.children)];
}

function clicarEmEditar(status: Partial<StatusExportCorte>, corte: Partial<Corte> = {}) {
  const props = {
    projetoId: 'p1',
    corte: { id: 'c7', numero: 7, status: 'aprovado', inicio_seg: 0, fim_seg: 60, ...corte } as unknown as Corte,
    status: { ...statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte' }), ...status },
    podeSubir: true,
    podeDescer: true,
    reordenando: false,
    onMover: vi.fn(),
    onEnviarYoutube: vi.fn(),
    onInformarUrl: vi.fn(),
    onLiberarPublicacao: vi.fn(),
    enviando: false,
  };
  function Sonda() {
    const artigo = CorteLinhaAp(props);
    const botao = elementos(artigo).find(
      (e) => e.type === 'button' && [e.props.children].flat(2).includes('Editar'),
    );
    expect(botao).toBeDefined();
    botao!.props.onClick!();
    return artigo;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <Sonda />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('D-1033 · "Editar" do Workspace abre o editor', () => {
  beforeEach(() => navegar.mockClear());

  it.each<[string, Partial<StatusExportCorte>, Partial<Corte>]>([
    ['sem bruto', {}, {}],
    ['com bruto', { raw_pronto: true }, { arquivo_clip_path: 'clip_raw.mkv' }],
    ['com render final', { raw_pronto: true, video_pronto: true }, { is_pos_producao: 1 }],
  ])('corte %s', (_etapa, status, corte) => {
    clicarEmEditar(status, corte);
    expect(navegar).toHaveBeenCalledWith('/projetos/p1/cortes/c7');
  });
});
