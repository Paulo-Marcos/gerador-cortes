import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/shared/api/problem';
import { useSincroniaBruta, type Sincronia } from '../useSincronia';

// D-1160 (decisão do Paulo: "Corrigir antes de entrar") · "Erro de sincronização" é o backend
// fora do ar ou quebrado, não uma consulta que falha POR DESENHO. `useOndaDoBruto` devolve 404
// quando o bruto ainda não existe (e 422 se o arquivo está quebrado), com `retry: false`, e a
// tela já mostra a régua lisa: o backend respondeu, a sincronização está em dia.
// Critério medido no código: o backend respondeu com 4xx (`ErroDaApi` com status < 500)
// é resposta, não falha; rede (sem `ErroDaApi`) e 5xx são falha.

function Sonda() {
  return <i>{useSincroniaBruta()}</i>;
}

async function estadoApos(erro: Error): Promise<Sincronia | undefined> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const obs = new QueryObserver(qc, { queryKey: ['consulta'], queryFn: () => Promise.reject(erro) });
  const sair = obs.subscribe(() => undefined);
  await vi.waitFor(() => expect(qc.getQueryState(['consulta'])?.status).toBe('error'));
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Sonda />
    </QueryClientProvider>,
  );
  sair();
  return /<i>(.*)<\/i>/.exec(html)?.[1] as Sincronia | undefined;
}

describe('o que acende "Erro de sincronização"', () => {
  it('404 (a onda do bruto ainda não existe) não acende', async () => {
    expect(await estadoApos(new ErroDaApi(404, '{"detail":"sem bruto"}', 'Not Found'))).toBe('sincronizado');
  });

  it('422 (arquivo do bruto quebrado, a tela já trata) não acende', async () => {
    expect(await estadoApos(new ErroDaApi(422, '', 'Unprocessable Entity'))).toBe('sincronizado');
  });

  it('500 acende', async () => {
    expect(await estadoApos(new ErroDaApi(500, '', 'Internal Server Error'))).toBe('erro');
  });

  it('rede fora do ar (fetch rejeita, sem resposta) acende', async () => {
    expect(await estadoApos(new TypeError('Failed to fetch'))).toBe('erro');
  });
});
