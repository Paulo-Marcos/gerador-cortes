import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CenaRemotion } from '@/types/models';
import type { YoutubeLayout } from '@/shared/palco/youtubeLayout';
import { SceneTimeline } from '../SceneTimeline';

// D-1164 (E-069 H-18, DIRECAO §7.4, §3.6, §8.2): a linha do tempo da Pós tem três pistas na MESMA
// régua, e a Pós inteira, que toca vídeo, não usa `backdrop-filter`. Foco, escala de fonte e
// `style` de aparência são das catracas; aqui ficam os que só o HTML mostra.

const LAYOUT: YoutubeLayout = {
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
  full: { crop: { x: 0, y: 0, w: 1920, h: 1080 }, slot: { x: 0, y: 0, w: 1920, h: 1080 } },
};
const CENAS = [{ tipo: 'tela_cheia', inicio: 0, fim: 10 } as CenaRemotion];

const linha = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}>
    <TooltipProvider>
      <SceneTimeline
        cenas={CENAS}
        currentTime={30}
        duration={120}
        layoutYoutube={LAYOUT}
        activeIdx={0}
        onSeek={vi.fn()}
        onAddRegion={vi.fn()}
        onRegionResize={vi.fn()}
        waveformCorteId="c1"
      />
    </TooltipProvider>
    </QueryClientProvider>,
  );

/** A tag de abertura de cada pista, pelo `data-testid`. */
const pista = (html: string, id: string) => new RegExp(`<div[^>]*data-testid="${id}"[^>]*>`).exec(html)?.[0] ?? '';

describe('D-1164 · a linha do tempo da Pós', () => {
  it('tem as três pistas: Cenas, Layout e Áudio, nessa ordem', () => {
    const html = linha();
    const posicoes = ['pista-cenas', 'pista-layout', 'pista-audio'].map((id) => html.indexOf(`data-testid="${id}"`));
    expect(posicoes.every((p) => p > 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    for (const rotulo of ['Cenas', 'Layout', 'Áudio']) expect(html).toContain(`>${rotulo}`);
  });

  it('as três pistas estão na mesma régua: mesma coluna de rótulo e mesma moldura', () => {
    const html = linha();
    // O rótulo tem 76 px nas três, e é a conta da agulha (`85px = 76 + 8 + 1`).
    expect(html.match(/w-\[76px\]/g)).toHaveLength(3);
    const molduras = ['pista-cenas', 'pista-layout', 'pista-audio'].map((id) =>
      /relative flex-1 overflow-hidden rounded-etiqueta border border-fio bg-poco/.test(pista(html, id)),
    );
    expect(molduras).toEqual([true, true, true]);
    // A agulha atravessa as três, e a régua de tempo começa no mesmo ponto das pistas.
    expect(html).toContain('left-[calc(85px+(100%-86px)*var(--x))]');
    expect(html).toContain('pl-[85px]');
    expect(html).toContain('--x:0.25');
  });

  it('o rótulo da agulha diz o tempo no corte, e a cena sob ela é a atual', () => {
    const html = linha();
    expect(html).toContain('data-testid="agulha-da-pos"');
    expect(html).toContain('00:30');
    expect(html).toMatch(/<button[^>]*aria-label="Cena [^"]*"[^>]*data-atual=""|<button[^>]*data-atual=""[^>]*aria-label="Cena/);
  });

  it('todo controle da linha do tempo leva `data-sala` (foco próprio) e nenhum blur', () => {
    const html = linha();
    const botoes = html.match(/<button[^>]*>/g) ?? [];
    expect(botoes.length).toBeGreaterThan(3);
    for (const botao of botoes) expect(botao).toContain('data-sala=""');
    expect(html).not.toMatch(/backdrop/);
  });
});

describe('D-1164 · a Pós não usa backdrop-filter (§3.6)', () => {
  const raiz = resolve(__dirname, '../../..');
  const fontes = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const caminho = resolve(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : fontes(caminho);
      return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [caminho] : [];
    });

  it.each(['editor/fase2', 'post-production'])('%s: nenhuma classe nem estilo de blur', (pasta) => {
    const comBlur = fontes(resolve(raiz, pasta)).filter((f) => /backdrop-(blur|filter)|backdropFilter/.test(readFileSync(f, 'utf8')));
    expect(comBlur).toEqual([]);
  });
});
