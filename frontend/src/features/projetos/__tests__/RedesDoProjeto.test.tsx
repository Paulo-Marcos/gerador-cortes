import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RedesDoProjeto } from '../RedesDoProjeto';
import type { Projeto } from '@/types/models';

// D-987: os dois chips do card — aceso só onde a live inteira já está.

function projeto(parcial: Partial<Projeto> = {}): Projeto {
  return {
    total_video_pronto: 3,
    redes_do_horizontal: [
      { plataforma: 'youtube', publicados: 3, completa: true },
      { plataforma: 'tiktok_horizontal', publicados: 1, completa: false },
    ],
    ...parcial,
  } as Projeto;
}

describe('RedesDoProjeto', () => {
  it('desenha as duas redes, na ordem, com o YouTube aceso e o TikTok apagado', () => {
    const html = renderToStaticMarkup(<RedesDoProjeto projeto={projeto()} />);

    const chips = [...html.matchAll(/data-rede="([a-z_]+)" data-ativa="(sim|nao)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(chips).toEqual([
      ['youtube', 'sim'],
      ['tiktok_horizontal', 'nao'],
    ]);
  });

  it('o chip conta no tooltip quantos dos cortes prontos já subiram', () => {
    const html = renderToStaticMarkup(<RedesDoProjeto projeto={projeto()} />);

    expect(html).toContain('title="Os 3 cortes prontos já estão no YouTube"');
    expect(html).toContain('title="1 de 3 cortes prontos no TikTok"');
  });

  it('live sem corte pronto não desenha chip nenhum', () => {
    const html = renderToStaticMarkup(
      <RedesDoProjeto projeto={projeto({ total_video_pronto: 0, redes_do_horizontal: [] })} />,
    );

    expect(html).toBe('');
  });
});
