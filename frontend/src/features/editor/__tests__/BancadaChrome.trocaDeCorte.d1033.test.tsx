import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1033: as teclas J e K da casca, as setas do seletor e a lista lateral são
// portas diferentes para o mesmo gesto, e as três seguem o caminho que a tela dá.
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

const { BancadaChrome } = await import('../BancadaChrome');

const corteDe = (id: string, numero: number) =>
  ({ id, numero, titulo_proposto: id, status: 'aprovado' }) as unknown as Corte;
const CORTES = [corteDe('a', 1), corteDe('b', 2), corteDe('c', 3)];

function publicar(aberto: Corte): Chrome {
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={CORTES}
          corte={aberto}
          exportStatus={[]}
          caminhoDoCorte={(c) => `/tela-atual?corte=${c.id}`}
          sub=""
          fire={false}
          sujo={false}
          salvando={false}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return publicado as unknown as Chrome;
}

describe('D-1033 · as portas da troca de corte', () => {
  beforeEach(() => navegar.mockClear());

  it('K e a seta de próximo vão ao corte seguinte pelo caminho da tela', () => {
    publicar(CORTES[0]).atual?.onProximo?.();
    expect(navegar).toHaveBeenCalledWith('/tela-atual?corte=b');
  });

  it('J e a seta de anterior vão ao corte de antes, dando a volta na lista', () => {
    publicar(CORTES[0]).atual?.onAnterior?.();
    expect(navegar).toHaveBeenCalledWith('/tela-atual?corte=c');
  });

  it('a lista lateral vai ao corte clicado pelo mesmo caminho', () => {
    publicar(CORTES[0]).lista?.itens?.[1].onClick?.();
    expect(navegar).toHaveBeenCalledWith('/tela-atual?corte=b');
  });
});
