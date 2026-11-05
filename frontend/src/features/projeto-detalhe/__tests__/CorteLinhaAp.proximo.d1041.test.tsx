import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-1041: a linha entrega o corte à regra do próximo passo. Sem ele, um corte com
// rastro de geração voltava a ouvir "Gerar bruto no editor", e o editor o devolvia
// à Pós: o laço que a auditoria achou. A regra tem o seu teste; este fixa o fio.
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

function clicarNoPrincipal(corte: Partial<Corte>, texto: string) {
  const props = {
    projetoId: 'p1',
    corte: { id: 'c7', numero: 7, status: 'aprovado', inicio_seg: 0, fim_seg: 60, ...corte } as unknown as Corte,
    status: statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte' }),
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
    const botao = elementos(artigo).find((e) => e.type === 'button' && [e.props.children].flat(2).includes(texto));
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

describe('D-1041 · a linha entrega o corte à regra do próximo passo', () => {
  beforeEach(() => navegar.mockClear());

  it('corte com rastro de geração e sem bruto vai à Pós', () => {
    clicarNoPrincipal({ is_pos_producao: 1 }, 'Gerar bruto na Pós');
    expect(navegar).toHaveBeenCalledWith('/projetos/p1/post-production?corte=c7');
  });

  it('corte sem rastro vai ao editor', () => {
    clicarNoPrincipal({}, 'Gerar bruto no editor');
    expect(navegar).toHaveBeenCalledWith('/projetos/p1/cortes/c7');
  });
});
