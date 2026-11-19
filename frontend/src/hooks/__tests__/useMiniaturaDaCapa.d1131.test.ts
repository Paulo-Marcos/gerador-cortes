import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { esquecerMiniaturas } from '@/lib/miniaturaDaCapa';
import { consultaDaMiniatura } from '../useMiniaturaDaCapa';

const CAPA = 'http://api/videos/p1/capa.jpg';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  esquecerMiniaturas();
});

describe('consulta da miniatura (TanStack Query)', () => {
  it('vários consumidores e re-renders da mesma capa fazem UMA requisição', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['jpg']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:da-rota');
    const cliente = new QueryClient();
    const observador = () => new QueryObserver(cliente, consultaDaMiniatura(CAPA));
    const a = observador();
    const b = observador();
    const fim = [a, b].map((o) => new Promise<void>((ok) => o.subscribe((r) => r.data && ok())));
    await Promise.all(fim);
    // Um "re-render" relê a consulta: com staleTime infinito, não volta à rede.
    await cliente.fetchQuery(consultaDaMiniatura(CAPA));
    expect(a.getCurrentResult().data).toBe('blob:da-rota');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sem capa a consulta fica desligada e não pede nada', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const o = new QueryObserver(new QueryClient(), consultaDaMiniatura(null));
    o.subscribe(() => {});
    expect(o.getCurrentResult().data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
