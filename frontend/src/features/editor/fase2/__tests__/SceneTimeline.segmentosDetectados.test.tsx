import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SceneTimeline } from '../SceneTimeline';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SegmentoDetectado } from '@/types/models';
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
