import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carregarFontesDoRender, esquecerFontesDoRender, FAMILIAS_DO_RENDER } from '../fontesDoRender';

// D-1139: a fonte do vídeo só desce quando uma prévia a pede. O ambiente é `node`
// (sem jsdom no projeto), então o `document` é um dublê mínimo: <head> + fonts.
describe('fontesDoRender', () => {
  type Link = { rel: string; href: string; onload?: () => void };
  let links: Link[];
  let entregaAutomatica: boolean;
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    esquecerFontesDoRender();
    links = [];
    entregaAutomatica = true;
    load = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('document', {
      fonts: { load },
      createElement: () => ({ rel: '', href: '' }) as Link,
      head: {
        querySelector: (seletor: string) => {
          const href = /href="([^"]+)"/.exec(seletor)?.[1];
          return links.find((l) => l.href === href) ?? null;
        },
        appendChild: (l: Link) => {
          links.push(l);
          if (entregaAutomatica) queueMicrotask(() => l.onload?.());
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('cobre as cinco fontes da legenda', () => {
    expect(FAMILIAS_DO_RENDER).toEqual(['Anton', 'Bebas Neue', 'Montserrat', 'Poppins', 'Oswald']);
  });

  it('injeta a folha de estilo e espera o navegador carregar a fonte', async () => {
    await carregarFontesDoRender(['Bebas Neue']);
    expect(links).toHaveLength(1);
    expect(links[0].href).toContain('family=Bebas+Neue:wght@400');
    expect(load).toHaveBeenCalledWith('400 16px "Bebas Neue"');
  });

  it('pede cada família uma vez só, mesmo chamada várias vezes', async () => {
    await Promise.all([carregarFontesDoRender(['Oswald']), carregarFontesDoRender(['Oswald'])]);
    await carregarFontesDoRender(['Oswald']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(links).toHaveLength(1);
  });

  it('família vazia ou desconhecida (a do canal) não baixa nada', async () => {
    await carregarFontesDoRender(['', 'Comic Sans']);
    expect(load).not.toHaveBeenCalled();
    expect(links).toHaveLength(0);
  });

  it('falha de rede não rejeita e permite tentar de novo', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    await expect(carregarFontesDoRender(['Poppins'])).resolves.toBeUndefined();
    await carregarFontesDoRender(['Poppins']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('só pede a fonte ao navegador depois que a folha de estilo chegou', async () => {
    entregaAutomatica = false;
    const pronto = carregarFontesDoRender(['Anton']);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    links[0].onload?.();
    await pronto;
    expect(load).toHaveBeenCalledTimes(1);
  });
});
