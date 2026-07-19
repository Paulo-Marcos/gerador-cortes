import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte, StatusExportCorte } from '@/types/models';
import { WorkbenchPanelsProvider } from '@/components/workbench/WorkbenchPanelsProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';

vi.mock('@/hooks/useEditor', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useEditor')>('@/hooks/useEditor');
  return {
    ...actual,
    useReordenarCortes: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import { WorkbenchCutsPanel } from '../WorkbenchCutsPanel';

function corte(numero: number, status: Corte['status'] = 'proposto'): Corte {
  return {
    id: `c${numero}`,
    projeto_id: 'p1',
    numero,
    titulo_proposto: `Corte ${numero}`,
    resumo: '',
    tema_central: '',
    inicio_hms: '00:00:00',
    fim_hms: '00:00:10',
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    status,
    arquivo_clip_path: '',
    youtube_video_id: '',
    youtube_url_publicado: '',
    youtube_scheduled_at: '',
    is_leitura: false,
    is_fire: false,
  } as unknown as Corte;
}

function render(cortes: Corte[], exportStatus: StatusExportCorte[] = []) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <WorkbenchPanelsProvider>
              <WorkbenchCutsPanel
                projetoId="p1"
                cortes={cortes}
                corteAtivoId={cortes[0]?.id ?? ''}
                exportStatus={exportStatus}
              />
            </WorkbenchPanelsProvider>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('WorkbenchCutsPanel — rodapé "FERRAMENTAS DO CORTE" (AUDITORIA-v2 §8, CP9)', () => {
  it('renderiza o rodapé fechado por padrão, sem duplicar "adicionar corte manual" já visível na lista', () => {
    const html = render([corte(1), corte(2, 'aprovado')]);

    expect(html).toContain('FERRAMENTAS DO CORTE');
    expect(html).toContain('aria-expanded="false"');
    // O botão tracejado "＋ adicionar corte" no rodapé DA LISTA continua lá
    // (DE-PARA §3) — o rodapé retrátil é fechado, então seu próprio botão
    // "Adicionar corte manual" não aparece no HTML estático até abrir.
    expect(html).toContain('＋ adicionar corte');
  });

  it('mantém a faixa colapsada "CORTES · aprovados/total" do PanelShell (já existente)', () => {
    const html = render([corte(1), corte(2, 'aprovado'), corte(3, 'editado')]);

    expect(html).toContain('CORTES · 2/3');
  });
});
