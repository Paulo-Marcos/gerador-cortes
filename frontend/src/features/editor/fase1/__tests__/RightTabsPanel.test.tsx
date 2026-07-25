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
    onGerarTrechosClaude: noop,
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

describe('RightTabsPanel — badge do trecho varia pelo motivo da remoção (D-422)', () => {
  const desviosDaIa: Desvio[] = [
    {
      inicio_hms: '00:27:57',
      fim_hms: '00:29:30',
      motivo: 'digressão sobre utilitarismo',
      origem: 'claude',
      categoria: 'tangente',
    },
    {
      inicio_hms: '00:37:10',
      fim_hms: '00:37:16',
      motivo: 'checagem com a audiência e repetição',
      origem: 'claude',
      categoria: 'repeticao',
    },
    {
      inicio_hms: '00:38:02',
      fim_hms: '00:38:09',
      motivo: 'Possível imprecisão — atribui a frase a Platão',
      origem: 'claude',
      categoria: 'imprecisao',
    },
  ];

  it('três trechos da MESMA origem (claude) rendem três badges distintos, sem "IA" genérico', () => {
    const html = render('workbench', desviosDaIa);

    expect(html).toContain('>tangente<');
    expect(html).toContain('>repeticao<');
    expect(html).toContain('>impreciso<');
    expect(html).not.toContain('>IA<');
  });

  it('o trecho impreciso avisa na mensagem, não só na cor do badge', () => {
    const html = render('workbench', desviosDaIa);

    expect(html).toContain('Possível imprecisão');
    expect(html).toContain('var(--wb-warn-soft)');
  });

  it('desvio legado sem categoria continua badgeado (fallback por motivo/origem)', () => {
    const html = render('workbench', [
      { inicio_hms: '00:36:14', fim_hms: '00:36:23', motivo: 'Trecho manual', origem: 'manual' },
      {
        inicio_hms: '00:40:00',
        fim_hms: '00:40:05',
        motivo: 'Silêncio Detectado (IA/Técnico)',
        origem: 'tecnico',
      },
    ]);

    expect(html).toContain('>manual<');
    expect(html).toContain('>silencio<');
  });
});
