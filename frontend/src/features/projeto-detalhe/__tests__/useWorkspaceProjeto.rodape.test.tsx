import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-870 · a fiação do rodapé no hook do Workspace, por comportamento (achado
// da pr-audit: a leitura do fonte deixava passar um rodapé fixo, o chip
// errado e o modal que nunca abre). As fronteiras — queries, API, o chrome e
// a navegação — são substitutos; a sonda clica no meio do render (o render de
// servidor reaplica o estado mudado nele) para ver o que o clique faz.
const h = vi.hoisted(() => ({
  id: 'p1',
  projeto: undefined as unknown,
  cortes: undefined as unknown,
  exportados: [] as unknown[],
  analiseEmVoo: false,
  navegar: vi.fn(),
  aprovarApi: vi.fn((_id: string) => Promise.resolve({})),
  notify: vi.fn(),
  chrome: undefined as unknown,
}));

// O aviso do lote sai depois do await; o toast de verdade usa `window`.
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify }) }));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: unknown) => {
    h.chrome = chrome;
  },
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => h.navegar,
  // A rota vem daqui, para a sonda poder trocar de live no meio do render.
  useParams: () => ({ id: h.id }),
}));
const mutacao = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: h.projeto, refetch: vi.fn() }),
  useExportStatus: () => ({ data: { cortes: h.exportados }, refetch: vi.fn() }),
  useProjetoProgressoWS: () => ({}),
  useAbrirPastaProjeto: mutacao,
  useRefazerTranscricao: mutacao,
  useAnalisarDesviosTodos: () => ({ disparar: vi.fn(), disparado: false }),
  useUploadYouTube: mutacao,
  useMarcarPublicadoYouTube: mutacao,
  useLiberarPublicacao: mutacao,
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: h.cortes, refetch: vi.fn() }),
  useReordenarCortes: mutacao,
}));
vi.mock('@/features/diarizacao/useDiarizacao', () => ({
  useAnaliseClaudeEmAndamento: () => h.analiseEmVoo,
}));
vi.mock('@/hooks/useWarmupWaveforms', () => ({ useWarmupWaveforms: () => undefined }));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: { canais: [] } }) }));
vi.mock('@/features/editor/api/cortes', async (original) => {
  const real = await original<typeof import('@/features/editor/api/cortes')>();
  return { ...real, cortesApi: { ...real.cortesApi, aprovarCorte: h.aprovarApi } };
});

const { useWorkspaceProjeto } = await import('../useWorkspaceProjeto');

type Estado = ReturnType<typeof useWorkspaceProjeto>;
const corte = (id: string, numero: number, status: Corte['status']) =>
  ({ id, numero, status, titulo_proposto: id, is_fire: false }) as unknown as Corte;
const exportado = (corte_id: string, numero: number, campos: Partial<StatusExportCorte> = {}) => ({
  ...statusExportPendente({ corte_id, numero, titulo: corte_id }),
  ...campos,
});

afterEach(() => {
  vi.clearAllMocks();
  h.id = 'p1';
  h.projeto = { id: 'p1', status: 'analisado', arquivos_limpos: false, titulo_live: 'Live' };
  h.cortes = undefined;
  h.exportados = [];
  h.analiseEmVoo = false;
  h.chrome = undefined;
});
h.projeto = { id: 'p1', status: 'analisado', arquivos_limpos: false, titulo_live: 'Live' };

/** Renderiza o hook; `noMeio` roda uma vez, no primeiro render, e o render de
 *  servidor refaz a tela com o estado que ela mudou. Devolve o último estado. */
function usar(rota = '/projetos/p1', noMeio?: (e: Estado, chrome: Chrome) => void): Estado {
  let ultimo: Estado | undefined;
  let feito = false;
  function Sonda() {
    ultimo = useWorkspaceProjeto();
    if (noMeio && !feito) {
      feito = true;
      noMeio(ultimo, h.chrome as Chrome);
    }
    return null;
  }
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/projetos/:id" element={<Sonda />} />
      </Routes>
    </MemoryRouter>,
  );
  return ultimo!;
}
const primario = () => (h.chrome as Chrome).barra?.primario;

describe('useWorkspaceProjeto · o rodapé', () => {
  it('carregando os cortes, o rodapé fica sem botão', () => {
    usar();
    expect((h.chrome as Chrome).barra).toBeUndefined();
  });

  it('analisando, o rodapé diz isso e não oferece outra análise', () => {
    h.cortes = [];
    h.analiseEmVoo = true;
    usar();
    expect([primario()!.texto, primario()!.desabilitado]).toEqual(['Analisando a live…', true]);
  });

  it('com propostos, "Aprovar os N" pede confirmação e, confirmado, aprova todos — mesmo os que o filtro esconde', async () => {
    h.cortes = [corte('a', 1, 'proposto'), corte('b', 2, 'proposto'), corte('c', 3, 'aprovado')];
    h.exportados = [exportado('a', 1), exportado('b', 2), exportado('c', 3)];
    // ?filtro=no-ar: nenhum dos propostos está visível.
    const estado = usar('/projetos/p1?filtro=no-ar', (_, chrome) => chrome.barra!.primario.onClick!());
    expect(estado.confirmacao.pedido?.titulo).toBe('Aprovar os 2 propostos');
    estado.confirmacao.confirmar();
    expect(h.aprovarApi.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith('2 corte(s) aprovado(s).', expect.anything()));
  });

  it('sem propostos, "Renderizar o #N" leva à Pós do corte', () => {
    h.cortes = [corte('a', 1, 'aprovado'), corte('b', 2, 'aprovado')];
    h.exportados = [exportado('a', 1, { video_pronto: true }), exportado('b', 2)];
    usar();
    expect(primario()!.texto).toBe('Renderizar o #2');
    primario()!.onClick!();
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/post-production?corte=b');
  });

  it('tudo pronto: "Publicar N" abre o modal de publicação, e o chip diz lote pronto', () => {
    h.cortes = [corte('a', 1, 'aprovado')];
    h.exportados = [
      exportado('a', 1, {
        video_pronto: true,
        pronto_publicar: true,
        titulo_youtube: 'T',
        thumbnail_pronta: true,
      }),
    ];
    const estado = usar('/projetos/p1', (_, chrome) => chrome.barra!.primario.onClick!());
    expect(estado.publicarAberto).toBe(true);
    expect((h.chrome as Chrome).estado?.texto).toBe('lote pronto');
    expect(primario()!.texto).toBe('Publicar 1 corte');
  });

  it('live limpa com pendência: "Live encerrada", sem alarme', () => {
    h.projeto = { id: 'p1', status: 'analisado', arquivos_limpos: true, titulo_live: 'Live' };
    h.cortes = [corte('a', 1, 'aprovado')];
    h.exportados = [exportado('a', 1)];
    usar();
    expect([primario()!.texto, primario()!.motivo]).toEqual(['Live encerrada', undefined]);
  });
});

describe('useWorkspaceProjeto · o rodapé e a live certa (2ª passada da pr-audit)', () => {
  it('baixando ou transcrevendo sem cortes, "Preparando a live…" — não oferece analisar', () => {
    h.projeto = { id: 'p1', status: 'baixando', arquivos_limpos: false, titulo_live: 'Live' };
    h.cortes = [];
    usar();
    expect([primario()!.texto, primario()!.desabilitado]).toEqual(['Preparando a live…', true]);
  });

  it('análise disparada antes (projeto em "analisando"), o rodapé diz isso', () => {
    h.projeto = { id: 'p1', status: 'analisando', arquivos_limpos: false, titulo_live: 'Live' };
    h.cortes = [];
    usar();
    expect(primario()!.texto).toBe('Analisando a live…');
  });

  it('projeto ainda não chegou, mesmo com cortes: sem botão', () => {
    h.projeto = undefined;
    h.cortes = [corte('a', 1, 'proposto')];
    usar();
    expect((h.chrome as Chrome).barra).toBeUndefined();
  });

  it('dados da live anterior no cache não viram o botão desta', () => {
    h.projeto = { id: 'OUTRA', status: 'analisado', arquivos_limpos: false, titulo_live: 'Antiga' };
    h.cortes = [corte('a', 1, 'proposto')];
    usar();
    expect((h.chrome as Chrome).barra).toBeUndefined();
  });

  it('trocar de live derruba a confirmação aberta na anterior', () => {
    h.cortes = [corte('a', 1, 'proposto')];
    h.exportados = [exportado('a', 1)];
    let abertaNaPrimeira: string | undefined;
    let depoisDaTroca: unknown = 'não chegou';
    function Sonda() {
      const [passo, setPasso] = useState(0);
      const estado = useWorkspaceProjeto();
      if (passo === 0) {
        (h.chrome as Chrome).barra!.primario.onClick!();
        setPasso(1);
      } else if (passo === 1) {
        abertaNaPrimeira = estado.confirmacao.pedido?.titulo;
        h.id = 'p2';
        setPasso(2);
      } else {
        depoisDaTroca = estado.confirmacao.pedido;
      }
      return null;
    }
    renderToStaticMarkup(
      <MemoryRouter>
        <Sonda />
      </MemoryRouter>,
    );
    expect(abertaNaPrimeira).toBe('Aprovar o proposto');
    expect(depoisDaTroca).toBeNull();
  });
});
