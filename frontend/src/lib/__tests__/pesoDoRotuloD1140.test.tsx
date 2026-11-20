import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeakerLabelOverlay } from '@/shared/palco/youtubeChrome';
import { carregarFontesDoRender, esquecerFontesDoRender } from '../fontesDoRender';

// D-1140: o rótulo do apresentador tem de sair na prévia no mesmo peso que o render.
// O render declara 850 mas só carrega os pesos de `palco-entry.tsx`; o navegador
// resolve o peso declarado para o mais próximo carregado (regra CSS para > 500:
// o mais pesado primeiro, depois o mais leve).
function resolverPeso(declarado: number, carregados: number[]): number {
  const ordenados = [...carregados].sort((a, b) => a - b);
  return ordenados.find((p) => p >= declarado) ?? ordenados[ordenados.length - 1];
}

const pesosDoRender = (): number[] => {
  const fonte = readFileSync(resolve(__dirname, '../../../../video-renderer/src/youtube-bg/palco-entry.tsx'), 'utf-8');
  const achado = /loadInter\("normal",\s*\{\s*weights:\s*\[([^\]]+)\]/.exec(fonte);
  return achado![1].split(',').map((p) => Number(p.replace(/["'\s]/g, '')));
};

describe('peso do rótulo do apresentador: prévia = render', () => {
  let hrefs: string[];
  beforeEach(() => {
    esquecerFontesDoRender();
    hrefs = [];
    vi.stubGlobal('document', {
      fonts: { load: vi.fn().mockResolvedValue([]) },
      createElement: () => ({ rel: '', href: '' }),
      head: {
        querySelector: () => null,
        appendChild: (l: { href: string; onload?: () => void }) => {
          hrefs.push(l.href);
          queueMicrotask(() => l.onload?.());
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a prévia carrega só os pesos de Inter que o render carrega', async () => {
    await carregarFontesDoRender(['Inter']);
    const pedidos = /wght@([\d;]+)/.exec(hrefs[0])![1].split(';').map(Number);
    expect(pedidos).toEqual(pesosDoRender());
  });

  it('o peso declarado do nome resolve no mesmo peso nos dois lados', async () => {
    await carregarFontesDoRender(['Inter']);
    const previa = /wght@([\d;]+)/.exec(hrefs[0])![1].split(';').map(Number);
    const html = renderToStaticMarkup(<SpeakerLabelOverlay left={0} top={0} nome="Fulano" />);
    const declarado = Number(/font-weight:(\d+)[^>]*>Fulano/.exec(html)![1]);
    expect(resolverPeso(declarado, previa)).toBe(resolverPeso(declarado, pesosDoRender()));
    expect(resolverPeso(declarado, previa)).toBe(700);
  });
});
