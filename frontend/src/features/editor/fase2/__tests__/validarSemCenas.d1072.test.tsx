import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conferenciaDaOrigemKey, corteKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import { cenasEmGeracaoKey } from '../../useGeracoesDaIa';
import { montarBotaoDoValidar, type EstadoDoValidar } from '../botaoDoValidar';
import { CenasPanel } from '../CenasPanel';

// D-1072 (RN-38): o plano vazio também se valida, e é isso que destrava o render
// final. Com zero cenas e fora da geração, o painel oferece "Validar sem cenas"
// no lugar de "Validar o plano (faltam N)"; durante a geração, espera.

const h = vi.hoisted(() => ({
  botoes: [] as Record<string, unknown>[],
  validar: vi.fn(),
}));

vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  geracaoIaApi: { gerarCenasClaude: vi.fn(), cenasEmGeracao: vi.fn().mockResolvedValue({ em_geracao: false }) },
  useUltimaGeracao: () => ({ data: undefined }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../useGravarCenas', () => ({ useGravarCenas: () => () => undefined }));
vi.mock('@/features/editor/useCenas', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCenas')>()),
  useValidarCenasRemotion: () => ({ mutate: h.validar, isPending: false }),
}));
// O tooltip do Radix pede `window`; aqui ele só repassa o filho, com a dica à vista.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children, label }: { children: ReactNode; label: string }) => (
    <span data-dica={label}>{children}</span>
  ),
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));
// O botão vira sonda: guarda as props, para o teste apertar o Validar.
vi.mock('@/components/ui/button', () => ({
  Button: ({ variant: _v, size: _s, ...props }: Record<string, unknown>) => {
    h.botoes.push(props);
    return <button {...props} />;
  },
}));

beforeEach(() => {
  h.botoes.length = 0;
  h.validar.mockReset();
});

function painel({ cenas = [] as CenaRemotion[], validadas = false, gerando = false } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(corteKey('c1'), { id: 'c1' });
  const versao = qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0;
  qc.setQueryData(conferenciaDaOrigemKey('c1', versao), { avisos: [] });
  qc.setQueryData(cenasEmGeracaoKey('c1'), { corte_id: 'c1', em_geracao: gerando });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <CenasPanel
        corteId="c1"
        projetoId="p1"
        cenas={cenas}
        cenaAtivaIdx={-1}
        cenasValidadas={validadas}
        onSeek={vi.fn()}
        onCenasChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const rotuloDoValidar = (html: string) =>
  html.match(/<button[^>]*data-testid="botao-validar-cenas"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? '';
const validarDoPainel = () => h.botoes.find((b) => b['data-testid'] === 'botao-validar-cenas')!;

describe('D-1072 · o painel com zero cenas', () => {
  it('oferece "Validar sem cenas", livre, e o clique valida o plano vazio', () => {
    const html = painel();

    expect(rotuloDoValidar(html)).toContain('Validar sem cenas');
    expect(rotuloDoValidar(html)).not.toContain('faltam');
    expect(html).toContain('data-dica="Validar o plano vazio: o render final sai sem cenas"');
    expect(validarDoPainel().disabled).toBe(false);
    (validarDoPainel().onClick as () => void)();
    expect(h.validar).toHaveBeenCalledWith(true, expect.anything());
  });

  it('durante a geração, espera as cenas: travado e sem "sem cenas"', () => {
    const html = painel({ gerando: true });

    expect(validarDoPainel().disabled).toBe(true);
    expect(rotuloDoValidar(html)).not.toContain('sem cenas');
    expect(html).toContain('data-dica="Espere as cenas terminarem de ser geradas"');
  });

  it('com o plano vazio validado, diz que está validado e o clique desfaz', () => {
    const html = painel({ validadas: true });

    expect(rotuloDoValidar(html)).toContain('Plano validado');
    (validarDoPainel().onClick as () => void)();
    expect(h.validar).toHaveBeenCalledWith(false, expect.anything());
  });

  it('com cenas, segue o "Validar o plano" da D-1070', () => {
    const html = painel({ cenas: [{ tipo: 'enfase', inicio: 0, fim: 5, texto: 'x' } as CenaRemotion] });

    expect(rotuloDoValidar(html)).toContain('Validar o plano');
    expect(rotuloDoValidar(html)).not.toContain('sem cenas');
  });
});

describe('D-1072 · montarBotaoDoValidar', () => {
  const estado = (e: Partial<EstadoDoValidar> = {}): EstadoDoValidar => ({
    cenasValidadas: false,
    faltam: 0,
    totalDeCenas: 0,
    dirty: false,
    emGeracao: false,
    validando: false,
    ...e,
  });

  it('zero cenas fora da geração: "Validar sem cenas", livre', () => {
    expect(montarBotaoDoValidar(estado())).toEqual({
      rotulo: 'Validar sem cenas',
      dica: 'Validar o plano vazio: o render final sai sem cenas',
      desabilitado: false,
    });
  });

  it('zero cenas na geração: travado, com o rótulo de sempre', () => {
    expect(montarBotaoDoValidar(estado({ emGeracao: true }))).toEqual({
      rotulo: 'Validar o plano',
      dica: 'Espere as cenas terminarem de ser geradas',
      desabilitado: true,
    });
  });

  it('com cenas, o rótulo conta as que faltam (D-1070)', () => {
    expect(montarBotaoDoValidar(estado({ totalDeCenas: 3, faltam: 2 }))).toMatchObject({
      rotulo: 'Validar o plano (faltam 2)',
      desabilitado: false,
    });
  });

  it('edição não salva ou validação em voo travam', () => {
    expect(montarBotaoDoValidar(estado({ dirty: true }))).toMatchObject({
      dica: 'Salve as cenas antes de validar',
      desabilitado: true,
    });
    expect(montarBotaoDoValidar(estado({ validando: true })).desabilitado).toBe(true);
  });

  it('validado, com ou sem cenas: "Plano validado" e a dica de desfazer', () => {
    for (const totalDeCenas of [0, 2]) {
      expect(montarBotaoDoValidar(estado({ cenasValidadas: true, totalDeCenas }))).toMatchObject({
        rotulo: 'Plano validado',
        dica: 'Desfazer a validação do plano',
        desabilitado: false,
      });
    }
  });
});
