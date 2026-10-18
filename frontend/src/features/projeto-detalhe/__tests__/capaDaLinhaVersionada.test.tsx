import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MetadadosDoCorteModal } from '@/features/metadata/MetadadosDoCorteModal';
import { metadataKey } from '@/features/metadata/useMetadataCard';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { exportStatusKey } from '@/shared/chavesDeCache';
import type { Corte, MetadadoCorte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// O modal se desenha num portal sobre o `document`; sem DOM, o portal vira o
// próprio conteúdo e o `document` é um esqueleto.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (filho: unknown) => filho,
}));
vi.stubGlobal('document', { querySelector: () => null, body: {} });

// D-969: a capa nova se grava por cima do MESMO arquivo e o Chrome guarda a
// imagem pela URL. A D-968 versionou o card de metadados; a miniatura da linha
// do corte e o modal de consulta seguiam com a URL pura e mostravam a capa
// velha do cache. A versão é a hora da leitura do dado que alimenta a capa.

const corte = {
  id: 'c1',
  numero: 1,
  status: 'proposto',
  is_fire: false,
  inicio_seg: 0,
  fim_seg: 60,
  inicio_hms: '00:00:00',
  fim_hms: '00:01:00',
} as unknown as Corte;

const status = {
  ...statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Um corte' }),
  thumbnail_path: 'thumbnails/thumb_c1.png',
};

function cliente(lidoEm: number, comMetadado = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(exportStatusKey('p1'), { cortes: [status] }, { updatedAt: lidoEm });
  if (comMetadado) {
    qc.setQueryData(
      metadataKey('c1'),
      { id: 'm1', corte_id: 'c1', prompt_thumbnail: 'p', thumbnail_path: 'thumbnails/thumb_c1.png' } as MetadadoCorte,
      { updatedAt: lidoEm },
    );
  }
  return qc;
}

const envolver = (qc: QueryClient, filho: React.ReactNode) => (
  <QueryClientProvider client={qc}>
    <ToastProvider>
      <TooltipProvider>
        <MemoryRouter>{filho}</MemoryRouter>
      </TooltipProvider>
    </ToastProvider>
  </QueryClientProvider>
);

const linha = (lidoEm: number) =>
  renderToStaticMarkup(
    envolver(
      cliente(lidoEm),
      <CorteLinhaAp
        projetoId="p1"
        corte={corte}
        status={status}
        podeSubir={false}
        podeDescer={false}
        reordenando={false}
        onMover={() => {}}
        onEnviarYoutube={() => {}}
        onInformarUrl={() => {}}
        onLiberarPublicacao={() => {}}
        enviando={false}
      />,
    ),
  );

const consulta = (lidoEm: number) =>
  renderToStaticMarkup(
    envolver(
      cliente(lidoEm, true),
      <MetadadosDoCorteModal projetoId="p1" status={status} aoFechar={() => {}} />,
    ),
  );

describe('capa versionada fora do card (D-969)', () => {
  it('a miniatura da linha leva a hora da leitura do status de export', () => {
    expect(linha(1_000)).toContain('thumb_c1.png?v=1000');
    expect(linha(2_000)).toContain('thumb_c1.png?v=2000');
  });

  it('a consulta do modal leva a hora da leitura do metadado', () => {
    expect(consulta(1_000)).toContain('thumb_c1.png?v=1000');
    expect(consulta(2_000)).toContain('thumb_c1.png?v=2000');
  });
});
