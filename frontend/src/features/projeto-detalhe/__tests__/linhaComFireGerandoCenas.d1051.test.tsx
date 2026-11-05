import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { FIRES_KEY } from '@/features/shorts/useFires';
import type { Corte, StatusExportCorte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-1051: a D-1037 ensinou a linha a dizer "gerando cenas", e a D-1051 pôs nela o caminho
// para os shorts. Aqui a linha inteira, com as duas juntas: uma não pode tirar a outra.

function linha(status: Partial<StatusExportCorte>) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(FIRES_KEY, { fires: [{ corte_id: 'c9', shorts: { total: 5, rejeitado: 0 } }] });
  const corte = {
    id: 'c9',
    numero: 9,
    status: 'aprovado',
    titulo_proposto: 'Corte',
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    is_fire: true,
  } as unknown as Corte;
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <CorteLinhaAp
              projetoId="p1"
              corte={corte}
              status={statusExportPendente({ corte_id: 'c9', numero: 9, titulo: 'Corte', ...status })}
              podeSubir={false}
              podeDescer={false}
              reordenando={false}
              onMover={vi.fn()}
              onEnviarYoutube={vi.fn()}
              onInformarUrl={vi.fn()}
              onLiberarPublicacao={vi.fn()}
              enviando={false}
            />
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('D-1051 · a linha do corte com Fire, durante e depois da geração de cenas', () => {
  it('gerando: diz que está gerando, sem mandar gerar, e o caminho dos shorts fica', () => {
    const html = linha({ raw_pronto: true, cenas_em_geracao: true });
    expect(html).toContain('Gerando cenas na Pós');
    expect(html).toContain('gerando cenas');
    expect(html).not.toContain('Gerar cenas na Pós');
    expect(html).toContain('Shorts deste corte (5)');
  });

  it('terminada a geração: volta o passo de sempre, com o mesmo caminho', () => {
    const html = linha({ raw_pronto: true, cenas_geradas: true });
    expect(html).toContain('Validar cenas na Pós');
    expect(html).not.toContain('Gerando cenas na Pós');
    expect(html).toContain('Shorts deste corte (5)');
  });
});
