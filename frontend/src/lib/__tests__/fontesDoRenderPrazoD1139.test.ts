import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carregarFontesDoRender, esquecerFontesDoRender } from '../fontesDoRender';

// D-1139 (auditoria): rede travada não deixa a prévia invisível, e o Inter do rótulo do apresentador carrega por aqui.
describe('fontesDoRender: prazo e Inter', () => {
  let links: { href: string; onload?: () => void }[];
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    esquecerFontesDoRender();
    links = [];
    load = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('document', {
      fonts: { load },
      createElement: () => ({ rel: '', href: '' }),
      head: {
        querySelector: () => null,
        appendChild: (l: { href: string; onload?: () => void }) => {
          links.push(l);
          queueMicrotask(() => l.onload?.());
        },
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pede o Inter nos pesos do rótulo (500 e 700, os do render)', async () => {
    await carregarFontesDoRender(['Inter']);
    expect(links[0].href).toContain('family=Inter:wght@500;700');
    expect(load).toHaveBeenCalledWith('500 16px "Inter"');
  });

  it('desiste da fonte depois de 3 s', async () => {
    vi.useFakeTimers();
    load.mockReturnValue(new Promise(() => {}));
    let terminou = false;
    void carregarFontesDoRender(['Anton']).then(() => (terminou = true));
    await vi.advanceTimersByTimeAsync(2900);
    expect(terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(terminou).toBe(true);
  });
});
