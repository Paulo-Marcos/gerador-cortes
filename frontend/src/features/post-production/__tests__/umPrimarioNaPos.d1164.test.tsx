import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte } from '@/types/models';
import type { BancadaChromeProps } from '@/features/editor/BancadaChrome';
import { corteKey } from '@/features/editor/useCortes';
import { montarPrimarioDaPos } from '../postProductionNavigation';
import { ActionBar } from '@/upgrade/ActionBar';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';

// D-1164 (DIRECAO §5, §7.4): a Pós tem UM primário, e ele é sempre um passo que se pode dar:
// "Validar plano" enquanto o plano não está validado, depois "Renderizar final" / "Renderizar
// de novo". Usa a régua `esperarPrimarios` (D-1138): conta `data-variant="primario"` no HTML da
// tela (página + barra de ação) e exige que o primário esteja aceso.
// A decisão de 06/11 segue valendo: o render só libera com o plano validado.

const h = vi.hoisted(() => ({ bancada: null as BancadaChromeProps | null }));

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live', arquivos_limpos: false } }),
  useExportStatus: () => ({ data: { cortes: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({
  useRenderFinal: () => ({
    renderFinal: { isPending: false },
    pipelineStatus: { data: { fases: { raw: true, grade: false, overlays: false, compose: false, encode: false } } },
    marcado: false,
    rodando: false,
    progresso: 0,
    pedir: vi.fn(),
    iniciar: vi.fn(),
  }),
  useStudioUrl: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/useBruto', () => ({
  useGerarBruto: () => ({ mutate: vi.fn(), isPending: false }),
  useStatusBruto: () => ({ data: undefined }),
}));
// O `useCorte` é o de verdade: é o cache dele que a validação do plano reescreve.
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: [], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleFire: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/settings', () => ({ useVelocidadePlayerPadrao: () => 1 }));
vi.mock('@/features/editor/fase2/EditorFase2', () => ({ EditorFase2: () => null }));
vi.mock('@/features/metadata/MetadadosDoCorteModal', () => ({
  MetadadosDoCorteModal: () => null,
  statusMinimo: () => ({}),
}));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: (props: BancadaChromeProps & { children?: ReactNode }) => {
    h.bancada = props;
    return null;
  },
}));

const { ScenesPostProductionPage } = await import('../ScenesPostProductionPage');

const CORTE = {
  id: 'c1',
  projeto_id: 'p1',
  numero: 1,
  titulo_proposto: 'Corte',
  status: 'aprovado',
  inicio_seg: 0,
  fim_seg: 60,
  desvios: [],
  is_pos_producao: 0,
  arquivo_clip_path: 'clip_raw.mkv',
  cenas_remotion: [{ tipo: 'tela_cheia', inicio: 0, fim: 5 }],
  cenas_validadas: 0,
} as unknown as Corte;




function telaInteira(corte: Corte) {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  qc.setQueryData(corteKey('c1'), corte);
  const pagina = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/projetos/p1/post-production?corte=c1']}>
            <Routes>
              <Route path="/projetos/:id/post-production" element={<ScenesPostProductionPage />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const barra = renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        <ActionBar barra={h.bancada!.barra as ComponentProps<typeof ActionBar>['barra']} />
      </TooltipProvider>
    </MemoryRouter>,
  );
  return pagina + barra;
}

/** O botão primário inteiro (o React escreve `disabled=""` quando está desabilitado). */
function botaoPrimario(html: string): string {
  const marca = html.indexOf('data-variant="primario"');
  if (marca < 0) return '';
  return html.slice(html.lastIndexOf('<button', marca), html.indexOf('</button>', marca));
}

describe('D-1164 · um primário só na Pós, e ele se pode apertar', () => {
  beforeEach(() => {
    h.bancada = null;
  });

  it.each([
    ['plano por validar', { cenas_validadas: 0 }, 'Validar plano'],
    ['plano validado', { cenas_validadas: 1 }, 'Renderizar final'],
  ])('%s: exatamente um primário, habilitado, com o verbo certo', (_nome, extra, texto) => {
    const html = telaInteira({ ...CORTE, ...extra } as Corte);

    esperarPrimarios(html, 'Pos');
    const primario = botaoPrimario(html);
    expect(primario).toContain(texto);
    expect(primario).not.toContain('disabled=""');
    expect(html).toContain(texto);
  });

  it('o render continua travado até validar: com o plano por validar não há "Renderizar" habilitado', () => {
    const html = telaInteira({ ...CORTE, cenas_validadas: 0 } as Corte);
    expect(html).not.toContain('Renderizar final');
    expect(h.bancada?.barra?.primario?.texto).toBe('Validar plano');
  });
});

describe('D-1164 · o primário da Pós por estado (montarPrimarioDaPos com onValidar)', () => {
  const base = {
    rodando: false, progresso: 0, videoPronto: false, brutoAusente: false, arquivosLimpos: false,
    nuncaGerou: false, gerandoBruto: false, planoValidado: false,
    onRenderizar: vi.fn(), onIrAoEditor: vi.fn(), onValidar: vi.fn(),
  };

  it('plano por validar: "Validar plano", habilitado, e o clique valida (não renderiza)', () => {
    const p = montarPrimarioDaPos(base);
    expect(p).toMatchObject({ texto: 'Validar plano', desabilitado: false });
    p.onClick();
    expect(base.onValidar).toHaveBeenCalledOnce();
    expect(base.onRenderizar).not.toHaveBeenCalled();
  });

  it('validando: diz "Validando…"', () => {
    expect(montarPrimarioDaPos({ ...base, validando: true }).texto).toBe('Validando…');
  });

  it('plano validado: Renderizar final; com o vídeo pronto, Renderizar de novo', () => {
    expect(montarPrimarioDaPos({ ...base, planoValidado: true })).toMatchObject({ texto: 'Renderizar final', desabilitado: false });
    expect(montarPrimarioDaPos({ ...base, planoValidado: true, videoPronto: true }).texto).toBe('Renderizar de novo');
  });

  it('sem bruto, o motivo continua sendo o bruto; rodando, o progresso', () => {
    expect(montarPrimarioDaPos({ ...base, brutoAusente: true })).toMatchObject({ texto: 'Renderizar final', desabilitado: true });
    expect(montarPrimarioDaPos({ ...base, rodando: true, progresso: 40 }).texto).toBe('Renderizando 40%');
  });
});
