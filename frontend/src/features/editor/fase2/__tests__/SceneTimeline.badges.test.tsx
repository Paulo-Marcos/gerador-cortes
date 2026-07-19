import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SceneTimeline } from '../SceneTimeline';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CenaRemotion } from '@/types/models';
import type { YoutubeLayout } from '../youtubeLayout';

// D-396 (AUDITORIA-v2 §10): badges de sucesso "N cenas ✓" / "palco gerado ✓"
// na Revisão final (Workbench). Cobrem só o toggle das novas props opcionais
// `cenasRenderizadas`/`palcoGerado` — o resto do componente (trilhas, seek,
// resize) já é coberto por SceneTimeline.segmentosDetectados.test.tsx.

const layoutComRegiao: YoutubeLayout = {
  modo_padrao: 'full',
  fundo: 'hud-forte',
  placa: { nome: 'X', papel: 'Y' },
  regioes: [{ inicio: 0, fim: 10, modo: 'compartilhada' }],
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

const umaCena: CenaRemotion[] = [{ tipo: 'tela_cheia', inicio: 0, fim: 10 } as CenaRemotion];

function renderTimeline(opts: { cenasRenderizadas?: boolean; palcoGerado?: boolean }) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SceneTimeline
        cenas={umaCena}
        currentTime={0}
        duration={120}
        layoutYoutube={layoutComRegiao}
        onSeek={vi.fn()}
        readOnly
        seekable
        cenasRenderizadas={opts.cenasRenderizadas}
        palcoGerado={opts.palcoGerado}
      />
    </TooltipProvider>,
  );
}

describe('SceneTimeline · badges de sucesso (D-396 / AUDITORIA-v2 §10)', () => {
  it('sem as novas props, mantem o badge neutro atual ("N cenas" / "N regiões")', () => {
    const html = renderTimeline({});

    expect(html).toContain('1 cenas');
    expect(html).toContain('1 região');
    expect(html).not.toContain('palco gerado');
    expect(html).not.toContain('lucide-check');
  });

  it('cenasRenderizadas=true troca o badge de cenas para o estilo de sucesso com check', () => {
    const html = renderTimeline({ cenasRenderizadas: true });

    expect(html).toContain('var(--wb-ok-soft)');
    expect(html).toContain('var(--wb-ok-ink)');
    expect(html).toContain('lucide-check');
    expect(html).toContain('1 cenas');
  });

  it('palcoGerado=true troca o texto "N regiões" por "palco gerado" com check', () => {
    const html = renderTimeline({ palcoGerado: true });

    expect(html).toContain('palco gerado');
    expect(html).not.toContain('1 região');
    expect(html).toContain('lucide-check');
  });

  it('palcoGerado=false (default) preserva "N regiões" mesmo com cenasRenderizadas=true', () => {
    const html = renderTimeline({ cenasRenderizadas: true, palcoGerado: false });

    expect(html).toContain('1 região');
    expect(html).not.toContain('palco gerado');
  });
});
