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
import type { Desvio } from '@/types/models';

const noop = vi.fn();

function baseProps(desvios: Desvio[] = []) {
  return {
    corteId: 'c1',
    desvios,
    selectedDesvioIdx: null,
    onSeek: noop,
    onAdicionarDesvio: noop,
    onRemoverDesvio: noop,
    onGerarManual: noop,
    onGerarTrechosIA: noop,
    pendingTrechos: {},
    transcricao: [],
    currentTime: 0,
    onAtualizarTranscricao: noop,
    transcricaoAtualizando: false,
  };
}

function render(variant?: 'legacy' | 'workbench', desvios?: Desvio[]) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <RightTabsPanel {...baseProps(desvios)} variant={variant} />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('RightTabsPanel â€” variant legacy (default) preserva o header atual', () => {
  it('mantÃ©m "Atualizar transcricao" no header e NÃƒO renderiza o rodapÃ© "Mais aÃ§Ãµes"', () => {
    const html = render();

    expect(html).toContain('aria-label="Atualizar transcricao"');
    expect(html).not.toContain('Mais aÃ§Ãµes');
  });

  it('mesmo comportamento quando variant nÃ£o Ã© passado (EditorFase1/shell antigo)', () => {
    const html = render('legacy');

    expect(html).toContain('aria-label="Atualizar transcricao"');
    expect(html).not.toContain('Mais aÃ§Ãµes');
  });
});

describe('RightTabsPanel â€” variant workbench move "Regerar transcriÃ§Ã£o" pro rodapÃ© (AUDITORIA-v2 Â§9, CP10)', () => {
  it('remove o refresh do header e mostra o rodapÃ© "Mais aÃ§Ãµes" fechado por padrÃ£o', () => {
    const html = render('workbench');

    expect(html).not.toContain('aria-label="Atualizar transcricao"');
    expect(html).toContain('Mais aÃ§Ãµes');
    expect(html).toContain('aria-expanded="false"');
    // Fechado por padrÃ£o: a aÃ§Ã£o "Regerar transcriÃ§Ã£o" ainda nÃ£o aparece no HTML.
    expect(html).not.toContain('Regerar transcriÃ§Ã£o');
  });

  it('mantÃ©m a busca na transcriÃ§Ã£o e o "Influenciar a capa" como estÃ£o (nÃ£o movidos)', () => {
    const html = render('workbench');

    // ThumbnailHintsEditor continua sempre visÃ­vel no topo do painel.
    expect(html).toContain('Influenciar');
  });
});

describe('RightTabsPanel â€” badge do trecho varia pelo motivo da remoÃ§Ã£o (D-422)', () => {
  const desviosDaIa: Desvio[] = [
    {
      inicio_hms: '00:27:57',
      fim_hms: '00:29:30',
      motivo: 'digressÃ£o sobre utilitarismo',
      origem: 'claude',
      categoria: 'tangente',
    },
    {
      inicio_hms: '00:37:10',
      fim_hms: '00:37:16',
      motivo: 'checagem com a audiÃªncia e repetiÃ§Ã£o',
      origem: 'claude',
      categoria: 'repeticao',
    },
    {
      inicio_hms: '00:38:02',
      fim_hms: '00:38:09',
      motivo: 'PossÃ­vel imprecisÃ£o â€” atribui a frase a PlatÃ£o',
      origem: 'claude',
      categoria: 'imprecisao',
    },
  ];

  it('trÃªs trechos da MESMA origem (claude) rendem trÃªs badges distintos, sem "IA" genÃ©rico', () => {
    const html = render('workbench', desviosDaIa);

    expect(html).toContain('>tangente<');
    expect(html).toContain('>repeticao<');
    expect(html).toContain('>impreciso<');
    expect(html).not.toContain('>IA<');
  });

  it('o trecho impreciso avisa na mensagem, nÃ£o sÃ³ na cor do badge', () => {
    const html = render('workbench', desviosDaIa);

    expect(html).toContain('PossÃ­vel imprecisÃ£o');
    expect(html).toContain('var(--wb-warn-soft)');
  });

  it('desvio legado sem categoria continua badgeado (fallback por motivo/origem)', () => {
    const html = render('workbench', [
      { inicio_hms: '00:36:14', fim_hms: '00:36:23', motivo: 'Trecho manual', origem: 'manual' },
      {
        inicio_hms: '00:40:00',
        fim_hms: '00:40:05',
        motivo: 'SilÃªncio Detectado (IA/TÃ©cnico)',
        origem: 'tecnico',
      },
    ]);

    expect(html).toContain('>manual<');
    expect(html).toContain('>silencio<');
  });
});
