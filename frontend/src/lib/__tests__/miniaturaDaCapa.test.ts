import { afterEach, describe, expect, it, vi } from 'vitest';
import { esquecerMiniaturas, LARGURA_DA_MINIATURA, miniaturaDaCapa } from '../miniaturaDaCapa';

// D-1127: sem DOM no vitest daqui, a imagem e o canvas são dublês.
let criadas = 0;
function montarDom(falha: boolean) {
  const desenhos: Array<[number, number]> = [];
  class FakeImage {
    crossOrigin = '';
    naturalWidth = 1280;
    naturalHeight = 720;
    onload: () => void = () => {};
    onerror: () => void = () => {};
    set src(_: string) {
      criadas += 1;
      queueMicrotask(() => (falha ? this.onerror() : this.onload()));
    }
  }
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => desenhos.push([w, h]) }),
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(['x'])),
    }),
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:miniatura' });
  return desenhos;
}

afterEach(() => {
  vi.unstubAllGlobals();
  esquecerMiniaturas();
  criadas = 0;
});

describe('miniaturaDaCapa', () => {
  it('reduz a capa para 64 px de largura, mantendo a proporção', async () => {
    const desenhos = montarDom(false);
    expect(await miniaturaDaCapa('http://x/capa.jpg')).toBe('blob:miniatura');
    expect(desenhos).toEqual([[LARGURA_DA_MINIATURA, 36]]);
  });

  it('reduz uma vez por live: a segunda chamada reaproveita', async () => {
    montarDom(false);
    await miniaturaDaCapa('http://x/capa.jpg');
    await miniaturaDaCapa('http://x/capa.jpg');
    expect(criadas).toBe(1);
  });

  it('falha (CORS, rede) devolve null e não fica guardada', async () => {
    montarDom(true);
    expect(await miniaturaDaCapa('http://x/capa.jpg')).toBeNull();
    montarDom(false);
    expect(await miniaturaDaCapa('http://x/capa.jpg')).toBe('blob:miniatura');
  });
});
