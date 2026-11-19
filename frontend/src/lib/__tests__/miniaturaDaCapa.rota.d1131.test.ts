import { afterEach, describe, expect, it, vi } from 'vitest';
import { esquecerMiniaturas, miniaturaDaCapa, urlDaMiniatura } from '../miniaturaDaCapa';

const CAPA = 'http://api/videos/p1/capa.jpg';

function canvasDeReserva() {
  let reducoes = 0;
  class FakeImage {
    crossOrigin = '';
    naturalWidth = 640;
    naturalHeight = 360;
    onload: () => void = () => {};
    onerror: () => void = () => {};
    set src(_: string) {
      reducoes += 1;
      queueMicrotask(() => this.onload());
    }
  }
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(['x'])),
    }),
  });
  return () => reducoes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  esquecerMiniaturas();
});

describe('miniaturaDaCapa — rota /miniaturas, canvas só de reserva', () => {
  it('a URL da miniatura é a irmã da capa', () => {
    expect(urlDaMiniatura(CAPA)).toBe('http://api/miniaturas/p1/capa.jpg');
    expect(urlDaMiniatura('data:image/png;base64,AAA')).toBeNull();
  });

  it('a miniatura vem da rota e o canvas nem é tocado', async () => {
    const reducoes = canvasDeReserva();
    const fetchMock = vi.fn(async () => new Response(new Blob(['jpg']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:da-rota' });
    expect(await miniaturaDaCapa(CAPA)).toBe('blob:da-rota');
    expect(fetchMock).toHaveBeenCalledWith('http://api/miniaturas/p1/capa.jpg');
    expect(reducoes()).toBe(0);
  });

  it.each([
    ['status de erro', async () => new Response('x', { status: 404 })],
    ['rede caída', async () => Promise.reject(new TypeError('rede'))],
  ])('se a rota falha (%s), cai no canvas', async (_nome, resposta) => {
    const reducoes = canvasDeReserva();
    vi.stubGlobal('fetch', vi.fn(resposta));
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:do-canvas' });
    expect(await miniaturaDaCapa(CAPA)).toBe('blob:do-canvas');
    expect(reducoes()).toBe(1);
  });

  it('a mesma capa não repete a requisição', async () => {
    canvasDeReserva();
    const fetchMock = vi.fn(async () => new Response(new Blob(['jpg']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:da-rota' });
    await Promise.all([miniaturaDaCapa(CAPA), miniaturaDaCapa(CAPA)]);
    await miniaturaDaCapa(CAPA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
