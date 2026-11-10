import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Corte, Desvio } from '@/types/models';

// D-1093 (P9, RN-36): "Manter todos" e "Tirar todos" passam pelo mesmo caminho do
// Riscar: o arraste de borda pendente é gravado antes, senão salvá-lo depois devolveria
// ao corte os silêncios que acabaram de ser riscados.

const SILENCIO: Desvio = {
  inicio_hms: '00:05:05.000',
  fim_hms: '00:05:22.000',
  motivo: 'Silêncio Detectado (IA/Técnico)',
  origem: 'tecnico',
};

let chamadas: { url: string; metodo: string }[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push({ url: pedido.url, metodo: pedido.method });
      return new Response('{}', { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function montar(ordem: string[]) {
  // Depois do `resetModules`, o provedor e o hook precisam vir da mesma carga de módulos.
  const { useTrechosRiscados } = await import('../useTrechosRiscados');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { ToastProvider } = await import('@/components/ui/toaster');
  const salvar = vi.fn(async (desvios: Desvio[]) => {
    ordem.push(`salvar:${desvios.length}`);
  });
  const historico = {
    getPresent: () => ({ desvios: [SILENCIO] }) as Partial<Corte>,
    reset: vi.fn(),
  } as unknown as Parameters<typeof useTrechosRiscados>[1];
  let acoes: ReturnType<typeof useTrechosRiscados> | undefined;
  function Sonda() {
    acoes = useTrechosRiscados('c1', historico, salvar, () => ordem.push('limpar-selecao'));
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <Sonda />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return acoes!;
}

it('"Manter todos" grava a borda pendente antes e risca todos num pedido só', async () => {
  const ordem: string[] = [];
  const acoes = await montar(ordem);

  acoes.decidirOsSilencios('manter');
  await vi.waitFor(() => expect(ordem).toContain('limpar-selecao'));

  expect(ordem).toEqual(['salvar:1', 'limpar-selecao']);
  expect(chamadas).toEqual([{ url: 'http://api.test/api/cortes/c1/manter-silencios', metodo: 'POST' }]);
});

it('"Tirar todos" vai à rota que devolve os silêncios riscados', async () => {
  const ordem: string[] = [];
  const acoes = await montar(ordem);

  acoes.decidirOsSilencios('tirar');
  await vi.waitFor(() => expect(ordem).toContain('limpar-selecao'));

  expect(chamadas).toEqual([{ url: 'http://api.test/api/cortes/c1/tirar-silencios', metodo: 'POST' }]);
});
