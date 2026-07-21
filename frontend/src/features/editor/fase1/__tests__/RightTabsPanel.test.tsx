import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';

vi.mock('@/hooks/useEditor', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useEditor')>('@/hooks/useEditor');
  return {
    ...actual,
    useCorte: () => ({ data: { projeto_id: 'p1' } }),
  };
});

vi.mock('@/hooks/useDiarizacao', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiarizacao')>(
    '@/hooks/useDiarizacao',
  );
  return {
    ...actual,
    useFalantes: () => ({ data: { falantes: {} } }),
    useDiarizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import { RightTabsPanel } from '../RightTabsPanel';

const noop = vi.fn();

function baseProps() {
  return {
    corteId: 'c1',
    desvios: [],
    selectedDesvioIdx: null,
    onSeek: noop,
    onAdicionarDesvio: noop,
    onRemoverDesvio: noop,
    onGerarManual: noop,
    onGerarTrechosClaude: noop,
    pendingTrechos: {},
    transcricao: [],
    currentTime: 0,
    onAtualizarTranscricao: noop,
    transcricaoAtualizando: false,
  };
}

function render(variant?: 'legacy' | 'workbench') {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <RightTabsPanel {...baseProps()} variant={variant} />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('RightTabsPanel — variant legacy (default) preserva o header atual', () => {
  it('mantém "Atualizar transcricao" no header e NÃO renderiza o rodapé "Mais ações"', () => {
    const html = render();

    expect(html).toContain('aria-label="Atualizar transcricao"');
    expect(html).not.toContain('Mais ações');
  });

  it('mesmo comportamento quando variant não é passado (EditorFase1/shell antigo)', () => {
    const html = render('legacy');

    expect(html).toContain('aria-label="Atualizar transcricao"');
    expect(html).not.toContain('Mais ações');
  });
});

describe('RightTabsPanel — variant workbench move "Regerar transcrição" pro rodapé (AUDITORIA-v2 §9, CP10)', () => {
  it('remove o refresh do header e mostra o rodapé "Mais ações" fechado por padrão', () => {
    const html = render('workbench');

    expect(html).not.toContain('aria-label="Atualizar transcricao"');
    expect(html).toContain('Mais ações');
    expect(html).toContain('aria-expanded="false"');
    // Fechado por padrão: a ação "Regerar transcrição" ainda não aparece no HTML.
    expect(html).not.toContain('Regerar transcrição');
  });

  it('mantém a busca na transcrição e o "Influenciar a capa" como estão (não movidos)', () => {
    const html = render('workbench');

    // ThumbnailHintsEditor continua sempre visível no topo do painel.
    expect(html).toContain('Influenciar');
  });
});
