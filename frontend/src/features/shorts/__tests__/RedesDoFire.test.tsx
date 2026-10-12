import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RedesDoFire } from '../RedesDoFire';
import type { FireComBruto } from '../shortsApi';

// D-905: os três chips do cartão — aceso só onde o corte inteiro já está.

const fire = {
  corte_id: 'c1',
  shorts: { total: 3, sugerido: 0, aprovado: 1, rejeitado: 0, renderizado: 2 },
  redes: [
    { plataforma: 'youtube_shorts', publicados: 2, completa: true },
    { plataforma: 'tiktok', publicados: 1, completa: false },
    { plataforma: 'instagram_reels', publicados: 0, completa: false },
  ],
} as FireComBruto;

describe('RedesDoFire', () => {
  it('desenha as três redes, na ordem, com o YouTube aceso e as outras apagadas', () => {
    const html = renderToStaticMarkup(<RedesDoFire fire={fire} />);

    const chips = [...html.matchAll(/data-rede="([a-z_]+)" data-ativa="(sim|nao)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(chips).toEqual([
      ['youtube_shorts', 'sim'],
      ['tiktok', 'nao'],
      ['instagram_reels', 'nao'],
    ]);
  });

  it('o chip conta no tooltip quantos dos prontos já subiram', () => {
    const html = renderToStaticMarkup(<RedesDoFire fire={fire} />);

    expect(html).toContain('title="Os 2 shorts prontos já estão no YouTube"');
    expect(html).toContain('title="1 de 2 shorts prontos no TikTok"');
  });
});
