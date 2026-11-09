import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte, Desvio } from '@/types/models';
import {
  bordaDoTrecho,
  provedorDaUltimaRodada,
  rotuloDoTempo,
  tempoQueSai,
} from '../fase1/perguntaDosDesvios';
import { applyDesvioChange } from '../editorEditState';

// D-1089 (P10, RN-36): o trecho diz de quem é a borda, e o ajustado volta à da IA.

const DA_IA: Desvio = {
  inicio_hms: '00:16:45.000',
  fim_hms: '00:18:41.000',
  motivo: 'Crítica pessoal',
  origem: 'claude',
  categoria: 'tangente',
  rodada: 2,
  borda_da_rodada: [1005, 1121],
};

describe('bordaDoTrecho', () => {
  it('com a borda que a rodada deu, é da IA', () => {
    expect(bordaDoTrecho(DA_IA)).toBe('ia');
  });

  it('o arraste ainda não salvo já a torna ajustada, sem esperar o Ctrl+S', () => {
    // O contrato do corte não declara o carimbo (vem como chave extra), daí o cast.
    const pendente = applyDesvioChange([DA_IA] as Corte['desvios'], {}, 0, '00:16:45.000', '00:18:56.000')!;

    expect(bordaDoTrecho(pendente.desvios![0])).toBe('ajustada');
  });

  it('a mesma tolerância do backend: o milissegundo do HMS não conta como ajuste', () => {
    expect(bordaDoTrecho({ ...DA_IA, borda_da_rodada: [1005.0015, 1120.999] })).toBe('ia');
    expect(bordaDoTrecho({ ...DA_IA, borda_da_rodada: [1005.01, 1121] })).toBe('ajustada');
  });

  it('sem carimbo de rodada, foi marcado à mão', () => {
    expect(bordaDoTrecho({ inicio_hms: '00:00:10', fim_hms: '00:00:12', motivo: 'm', origem: 'manual' })).toBe(
      'manual',
    );
    expect(bordaDoTrecho({ ...DA_IA, borda_da_rodada: undefined })).toBe('manual');
  });
});

describe('tempoQueSai e rotuloDoTempo', () => {
  it('trecho dentro de outro conta uma vez', () => {
    const fora = { inicio_hms: '00:16:45', fim_hms: '00:18:41', motivo: 'a' };
    const dentro = { inicio_hms: '00:17:35', fim_hms: '00:18:34', motivo: 'b' };
    const depois = { inicio_hms: '00:18:41', fim_hms: '00:18:56', motivo: 'c' };

    expect(tempoQueSai([fora, dentro, depois])).toBe(116 + 15);
    expect(rotuloDoTempo(tempoQueSai([fora, dentro, depois]))).toBe('2:11');
  });

  it('abaixo de um minuto, em segundos', () => {
    expect(rotuloDoTempo(17.4)).toBe('17 s');
    expect(rotuloDoTempo(60)).toBe('1:00');
  });
});

describe('provedorDaUltimaRodada', () => {
  it('é quem fez a rodada mais nova que ainda dá para desfazer', () => {
    const antiga: Desvio = { ...DA_IA, origem: 'gemini', rodada: 1, borda_da_rodada: [1005, 1121] };
    const ajustada: Desvio = { ...DA_IA, rodada: 3, inicio_hms: '00:16:00.000' };

    expect(provedorDaUltimaRodada([antiga, DA_IA, ajustada])).toBe('Claude');
    expect(provedorDaUltimaRodada([antiga])).toBe('Gemini');
    expect(provedorDaUltimaRodada([ajustada])).toBeNull();
  });
});

describe('o pedido ao backend', () => {
  let chamadas: { url: string; metodo: string; corpo: unknown }[] = [];

  beforeEach(() => {
    chamadas = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        chamadas.push({ url: pedido.url, metodo: pedido.method, corpo: await pedido.json().catch(() => null) });
        return new Response('{}', { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('cortesApi.voltarABordaDaIa manda o índice do trecho', async () => {
    const { cortesApi } = await import('../api/cortes');
    await cortesApi.voltarABordaDaIa('c1', 3);

    expect(chamadas).toEqual([
      { url: 'http://api.test/api/cortes/c1/voltar-a-borda-da-ia', metodo: 'POST', corpo: { desvio_index: 3 } },
    ]);
  });

  it('com uma borda pendente, grava a lista antes de voltar: o índice é o da lista gravada', async () => {
    // Depois do `resetModules`, o provedor e o hook precisam vir da mesma carga de módulos.
    const { useTrechosRiscados } = await import('../useTrechosRiscados');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { ToastProvider } = await import('@/components/ui/toaster');
    const ordem: string[] = [];
    const salvar = vi.fn(async (desvios: Desvio[]) => {
      ordem.push(`salvar:${desvios.length}`);
    });
    const historico = {
      getPresent: () => ({ desvios: [DA_IA] }) as Partial<Corte>,
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

    acoes!.voltarABordaDaIa(0);
    await vi.waitFor(() => expect(ordem).toContain('limpar-selecao'));

    expect(ordem).toEqual(['salvar:1', 'limpar-selecao']);
    expect(chamadas[0]).toMatchObject({ url: 'http://api.test/api/cortes/c1/voltar-a-borda-da-ia', corpo: { desvio_index: 0 } });
  });
});
