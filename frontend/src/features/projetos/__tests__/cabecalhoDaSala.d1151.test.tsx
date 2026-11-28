import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { AcoesDaTela, ScreenHeader } from '@/upgrade/ScreenHeader';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import BibliotecaPage from '../BibliotecaPage';
import { consultaDoOperador } from '../useSalaDaBiblioteca';
import { projeto } from './fixtures/projetoDaSala';

// D-1151 (DIRECAO §7.1 e §11): a tela escolhe a palavra do feixe e o sobretítulo do
// cabeçalho. A Biblioteca é lida pelo que ela PUBLICA para a casca (o efeito não roda no
// `renderToStaticMarkup`, então o `useDefinirChrome` é trocado por um gravador).

const publicado = vi.hoisted(() => ({ chrome: {} as Chrome }));

vi.mock('@/upgrade/UpgradeChrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado.chrome = chrome;
  },
}));

vi.mock('../useProjetos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useProjetos')>()),
  useProjetos: () => ({ data: [projeto({ total_cortes: 6 })], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 20, 21, 30));
});
afterEach(() => vi.useRealTimers());

function chromeDaBiblioteca(nome: string): Chrome {
  const qc = new QueryClient();
  qc.setQueryData(consultaDoOperador.queryKey, { nome });
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <BibliotecaPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return publicado.chrome;
}

function cabecalho(chrome: Chrome) {
  return renderToStaticMarkup(
    <ScreenHeader titulo={chrome.titulo!} destaque={chrome.destaque} sobretitulo={chrome.sobretitulo} sub={chrome.sub} />,
  );
}

const h1 = (html: string) => /<h1[^>]*>.*?<\/h1>/.exec(html)![0];

describe('o cabeçalho da Biblioteca (D-1151)', () => {
  it('sem o nome do operador, a saudação sai sem palavra no feixe', () => {
    const titulo = h1(cabecalho(chromeDaBiblioteca('')));
    expect(titulo).not.toContain('text-feixe');
    expect(titulo).toMatch(/>Boa noite\.<\/h1>$/);
  });

  it('com o nome, o feixe fica só no primeiro nome', () => {
    const titulo = h1(cabecalho(chromeDaBiblioteca('Paulo Marcos')));
    expect(titulo).toMatch(/>Boa noite, <span class="[^"]*text-feixe[^"]*">Paulo<\/span>\.<\/h1>$/);
  });

  it('o sobretítulo é a data, e o subtítulo diz só o estado da casa', () => {
    const chrome = chromeDaBiblioteca('');
    expect(chrome.sobretitulo).toBe('sex, 20 de nov');
    expect(chrome.sub).toBe('6 cortes esperam o seu ok.');
    expect(cabecalho(chrome)).toMatch(/<p class="[^"]*text-iris[^"]*">sex, 20 de nov<\/p><h1/);
  });

  it('o "Nova live" é um Button da Sala, secundário, sem o .btn legado', () => {
    const html = renderToStaticMarkup(<AcoesDaTela acoes={chromeDaBiblioteca('').acoes} />);
    expect(html).toMatch(/<button[^>]*data-variant="secundario"[^>]*>.*Nova live<\/button>/);
    expect(html).not.toMatch(/class="(?:[^"]* )?btn[ "-]/);
  });
});
