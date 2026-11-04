import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useGravarCenas } from '../fase2/useGravarCenas';
import { useSalvarAoSair } from '../useSalvarAoSair';
import { assentar, montar } from './domMinimo';

// D-1036 (achados da auditoria): cenas e desmonte no meio do salvamento.
// D-1036: a Pós trocava de corte (J, K, setas, lista) com cena ou layout sem
// salvar e perdia o ajuste em silêncio — a troca só muda `?corte=`, e a tela
// nova nasce zerada (D-1033). O editor já salvava na saída; o gancho é o mesmo.

const h = vi.hoisted(() => ({
  gravar: vi.fn(),
  avisos: [] as string[],
}));

vi.mock('@/components/ui/toaster', () => ({
  useToast: () => ({ notify: (texto: string) => h.avisos.push(texto) }),
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAtualizarCorte: () => ({ mutate: vi.fn(), mutateAsync: h.gravar, isPending: false }),
}));
vi.mock('@/features/projetos/api', () => ({ projetosApi: { obterProjeto: async () => ({}) } }));
vi.mock('@/features/settings/api', () => ({ settingsApi: { obterSettings: async () => ({}) } }));
vi.mock('../fase2/useSegmentosDetectados', () => ({
  useSegmentosDetectados: () => ({ segmentos: [], detectar: vi.fn(), detectando: false }),
}));
vi.mock('@/features/channels/palcoDoEscopo', () => ({ useLayoutPresetsDoEstilo: () => ({ data: [] }) }));
vi.mock('@/features/channels/usePalcoDoModal', () => ({ useAplicarPalcoDoPreset: () => vi.fn() }));

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

const rota = (r: { state: { location: { pathname: string; search: string } } }) =>
  r.state.location.pathname + r.state.location.search;
const POS = '/projetos/p1/post-production';

async function abrir(Sonda: () => null) {
  const roteador = createMemoryRouter(
    [{ path: POS, element: <UmaTelaPorCorte><Sonda /></UmaTelaPorCorte> }, { path: '/projetos', element: null }],
    { initialEntries: [`${POS}?corte=c5`] },
  );
  ({ limpar } = montar(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  ));
  await assentar();
  return roteador;
}

describe('D-1036 · cenas e desmonte durante o salvamento', () => {
  let salvar = vi.fn();
  function SondaGenerica({ sujo }: { sujo: boolean }) {
    useSalvarAoSair({ sujo, salvar: () => salvar(), avisoDeSucesso: 'salvo' });
    return null;
  }
  beforeEach(() => {
    salvar = vi.fn().mockResolvedValue(undefined);
    h.gravar.mockReset().mockResolvedValue(undefined);
    h.avisos.length = 0;
  });

  it('o painel desmontado durante o salvamento não derruba a promessa', async () => {
    let solta: () => void = () => undefined;
    salvar.mockReturnValue(new Promise<void>((r) => (solta = r)));
    let sai: () => void = () => undefined;
    function Alterna() {
      const [aberto, setAberto] = useState(true);
      sai = () => setAberto(false);
      return aberto ? <SondaGenerica sujo /> : null;
    }
    const naoTratadas: unknown[] = [];
    const ouvir = (erro: unknown) => naoTratadas.push(erro);
    process.on('unhandledRejection', ouvir);
    const roteador = await abrir(() => <Alterna /> as unknown as null);
    await roteador.navigate(`${POS}?corte=c6`);
    await assentar();
    sai();
    await assentar();
    solta();
    await assentar();
    process.off('unhandledRejection', ouvir);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(naoTratadas).toEqual([]);
  });

  describe('o painel de cenas', () => {
    let gravarCenas: ReturnType<typeof useGravarCenas>;
    const cenas = [{ tipo: 'barra_inferior', inicio: 1, fim: 5, texto: 'ALTERADA' }] as never;
    function Cenas({ dirty }: { dirty: boolean }) {
      gravarCenas = useGravarCenas({
        atualizar: { mutateAsync: h.gravar } as never,
        formato: '16:9',
        cenas,
        dirty,
        setDirty: () => undefined,
      });
      return null;
    }

    it('cenas alteradas e não salvas são gravadas ao trocar de corte', async () => {
      const roteador = await abrir(() => <Cenas dirty /> as unknown as null);
      await roteador.navigate(`${POS}?corte=c6`);
      await assentar();
      expect(h.gravar).toHaveBeenCalledTimes(1);
      expect(h.gravar.mock.calls[0][0]).toEqual({ cenas_remotion: { formato: '16:9', cenas } });
      expect(rota(roteador)).toBe(`${POS}?corte=c6`);
    });

    it('cenas sem alteração trocam de corte sem gravar', async () => {
      const roteador = await abrir(() => <Cenas dirty={false} /> as unknown as null);
      await roteador.navigate(`${POS}?corte=c6`);
      await assentar();
      expect(h.gravar).not.toHaveBeenCalled();
      expect(gravarCenas).toBeTypeOf('function');
    });

    it('o painel de verdade usa o gancho (o JSX não roda sem DOM)', () => {
      const fonte = readFileSync(resolve(__dirname, '../fase2/CenasPanel.tsx'), 'utf8');
      expect(fonte).toContain('useGravarCenas({');
    });
  });
});
