import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SceneTimeline } from '../SceneTimeline';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CenaRemotion, SegmentoDetectado } from '@/types/models';
import type { YoutubeLayout } from '../youtubeLayout';

const layout: YoutubeLayout = {
  modo_padrao: 'full',
  fundo: 'hud-forte',
  placa: { nome: 'X', papel: 'Y' },
  regioes: [],
  compartilhada: {
    telas: 2,
    crop_facecam: { x: 24, y: 410, w: 340, h: 260 },
    crop_tela: { x: 365, y: 180, w: 1325, h: 720 },
    slot_facecam: { x: 54, y: 405, w: 340, h: 260 },
    slot_tela: { x: 500, y: 150, w: 1325, h: 720 },
  },
  full: {
    crop: { x: 0, y: 0, w: 1920, h: 1080 },
    slot: { x: 0, y: 0, w: 1920, h: 1080 },
  },
};

function render(segmentos: SegmentoDetectado[], readOnly = false) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SceneTimeline
        cenas={[]}
        currentTime={0}
        duration={120}
        layoutYoutube={layout}
        onSeek={vi.fn()}
        segmentosDetectados={segmentos}
        onSelectSegmentoDetectado={vi.fn()}
        readOnly={readOnly}
      />
    </TooltipProvider>,
  );
}

describe('SceneTimeline · segmentos detectados (F-054)', () => {
  it('renderiza um marcador por segmento sugerido', () => {
    const segmentos: SegmentoDetectado[] = [
      { inicio: 0, fim: 10, score: 0.5, status: 'sugerido' },
      { inicio: 10, fim: 20, score: 0.5, status: 'sugerido' },
      { inicio: 20, fim: 30, score: 0.5, status: 'sugerido' },
    ];

    const html = render(segmentos);

    const matches = html.match(/aria-label="Segmento detectado \(sugestão\)"/g);
    expect(matches?.length).toBe(3);
  });

  it('omite segmentos que ja foram decididos (aceito/rejeitado)', () => {
    const segmentos: SegmentoDetectado[] = [
      { inicio: 0, fim: 10, score: 0.5, status: 'sugerido' },
      { inicio: 10, fim: 20, score: 0.5, status: 'aceito_full' },
      { inicio: 20, fim: 30, score: 0.5, status: 'aceito_compartilhada' },
      { inicio: 30, fim: 40, score: 0.5, status: 'rejeitado' },
    ];

    const html = render(segmentos);

    const matches = html.match(/aria-label="Segmento detectado \(sugestão\)"/g);
    expect(matches?.length).toBe(1);
  });

  it('readOnly esconde marcadores (paridade com regioes/cenas)', () => {
    const segmentos: SegmentoDetectado[] = [{ inicio: 0, fim: 10, score: 0.5, status: 'sugerido' }];

    const html = render(segmentos, true);

    expect(html).not.toContain('Segmento detectado (sugestão)');
  });

  it('sem segmentos detectados, nao polui o markup', () => {
    const html = render([]);

    expect(html).not.toContain('Segmento detectado');
  });
});

// D-381: a timeline da tela Final precisa NAVEGAR (seek por clique) mesmo em
// readOnly. `seekable` habilita o seek sem reabrir a edicao.
function renderTimeline(opts: { readOnly?: boolean; seekable?: boolean; cenas?: CenaRemotion[] }) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SceneTimeline
        cenas={opts.cenas ?? []}
        currentTime={0}
        duration={120}
        layoutYoutube={layout}
        onSeek={vi.fn()}
        readOnly={opts.readOnly}
        seekable={opts.seekable}
      />
    </TooltipProvider>,
  );
}

const umaCena: CenaRemotion[] = [{ tipo: 'tela_cheia', inicio: 0, fim: 10 } as CenaRemotion];

/** Extrai a tag de abertura do <button> do bloco de cena para asserçoes
 *  escopadas (o header em modo edicao tem outros botoes disabled — ex.: zoom
 *  no minimo — que poluiriam um match no html inteiro). */
function sceneButtonTag(html: string): string {
  return html.match(/<button[^>]*aria-label="Cena[^>]*>/)?.[0] ?? '';
}

describe('SceneTimeline · seekable (D-381)', () => {
  it('readOnly puro deixa o bloco de cena estatico (disabled, cursor-default)', () => {
    const btn = sceneButtonTag(renderTimeline({ readOnly: true, cenas: umaCena }));

    expect(btn).not.toBe(''); // o bloco renderizou
    expect(btn).toContain('disabled'); // sem seek
    expect(btn).toContain('cursor-default');
  });

  it('readOnly + seekable habilita o seek no bloco, mantendo a edicao off', () => {
    const html = renderTimeline({ readOnly: true, seekable: true, cenas: umaCena });
    const btn = sceneButtonTag(html);

    expect(btn).not.toBe('');
    expect(btn).not.toContain('disabled'); // clicavel para seek
    expect(btn).toContain('cursor-pointer');
    // edicao permanece desligada: sem +Comp/+Full nem controles de zoom
    expect(html).not.toContain('Comp.');
    expect(html).not.toContain('Aumentar zoom');
  });

  it('sem readOnly (edicao) o bloco segue clicavel como antes', () => {
    const btn = sceneButtonTag(renderTimeline({ cenas: umaCena }));

    expect(btn).not.toContain('disabled');
    expect(btn).toContain('cursor-pointer');
  });
});
