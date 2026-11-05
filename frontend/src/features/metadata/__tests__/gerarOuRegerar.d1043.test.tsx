import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte, MetadadoCorte } from '@/types/models';

// D-1043: o backend preenche só o que falta, e substituir é pedido explícito. Aqui
// mora quem escolhe: cada gesto da tela tem de pedir a rota certa, senão o "Regerar"
// para de regerar ou o "Completar" reescreve o título escrito à mão.

const h = vi.hoisted(() => ({
  gerar: vi.fn(async () => ({})),
  regerar: vi.fn(async () => ({})),
}));

vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  geracaoIaApi: { gerarMetadadosClaude: h.gerar, regerarMetadadosClaude: h.regerar },
}));

const { MetadataCard } = await import('../MetadataCard');
const { metadataKey } = await import('../useMetadataCard');
const { pedirGeracao, rotuloDaGeracao } = await import('../geracaoDoCard');

const completo = {
  titulo_youtube: 'Meu título',
  descricao_youtube: 'Minha descrição',
  texto_capa: 'CAPA',
  tags_youtube: ['tag'],
};
const soTitulo = { ...completo, descricao_youtube: '' };

function renderizar(meta: typeof completo) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(metadataKey('c1'), { id: 'm1', corte_id: 'c1', is_fire: false, ...meta } as MetadadoCorte);
  const corte = { id: 'c1', projeto_id: 'p1', numero: 1, titulo_proposto: 'Proposto', desvios: [] } as unknown as Corte;
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <MetadataCard projetoId="p1" cut={corte} variant="modal" />
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.gerar.mockClear();
  h.regerar.mockClear();
});

describe('o botão de IA do card', () => {
  it('com título e descrição, diz regerar e pede para substituir', async () => {
    expect(rotuloDaGeracao(completo)).toBe('Regerar metadados');
    expect(renderizar(completo)).toContain('aria-label="Regerar metadados com o Claude"');

    await pedirGeracao('c1', completo, 'gemini');

    expect(h.regerar).toHaveBeenCalledWith('c1', 'gemini');
    expect(h.gerar).not.toHaveBeenCalled();
  });

  it('com título e sem descrição, diz completar e não pede para substituir', async () => {
    expect(rotuloDaGeracao(soTitulo)).toBe('Completar metadados');
    const html = renderizar(soTitulo);
    expect(html).toContain('aria-label="Completar metadados com o Claude"');
    expect(html).not.toContain('aria-label="Regerar metadados');

    await pedirGeracao('c1', soTitulo, 'claude');

    expect(h.gerar).toHaveBeenCalledWith('c1', 'claude');
    expect(h.regerar).not.toHaveBeenCalled();
  });

  it('sem metadado, gera', async () => {
    await pedirGeracao('c1', undefined, 'claude');

    expect(h.gerar).toHaveBeenCalledWith('c1', 'claude');
    expect(h.regerar).not.toHaveBeenCalled();
  });

  it('o Desfazer só guarda versão de quem regerou', () => {
    const hook = readFileSync(resolve(__dirname, '../useMetadataCard.tsx'), 'utf-8');
    expect(hook).toMatch(/versaoAntesDaIa\.current =\s+meta && estaCompleto\(meta\)/);
  });
});

describe('os gestos do editor', () => {
  // O hook de página depende de meia tela para montar; o que importa aqui é qual
  // pedido cada gesto faz, e o trecho é curto o bastante para ler direto.
  const pagina = readFileSync(resolve(__dirname, '../../editor/useEditorPage.tsx'), 'utf-8');

  it('"Também refazer: metadados" é pedido explícito para substituir', () => {
    expect(pagina).toMatch(/plano\.metadados\) gerarMetadadosClaude\.mutate\(\{ substituir: true \}\)/);
  });

  it('a primeira geração do bruto não pede para substituir', () => {
    const inicial = pagina.slice(pagina.indexOf('const handleGerarBrutoInicial'));
    const corpo = inicial.slice(0, inicial.indexOf('};'));
    expect(corpo).toContain("gerarMetadadosClaude.mutate('claude')");
  });
});
