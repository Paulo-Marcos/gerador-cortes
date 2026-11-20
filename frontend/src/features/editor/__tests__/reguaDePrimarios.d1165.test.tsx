import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Corte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { montarBarraDoEditor } from '../acoesDoEditor';
import { BrutoContextStrip } from '../fase1/BrutoContextStrip';
import { TimelinePanel } from '../fase1/TimelinePanel';

// D-1165 (E-069 H-06): o editor passa pela régua `esperarPrimarios` (DIRECAO §5). A tela é a
// mesma montada pelo teste da D-1150 (que segue com o contador próprio): cabeçalho, faixa,
// linha do tempo e a barra da casca, onde mora "Ir para a Pós".

let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosDeExclusao: () => ({ data: undefined }) }));
vi.mock('@/upgrade/useModoFoco', () => ({ useModoFocoAtivo: () => false }));

const { BancadaChrome } = await import('../BancadaChrome');
const { CabecalhoDoCorte } = await import('../CabecalhoDoCorte');

const CORTE = {
  id: 'c1',
  numero: 1,
  projeto_id: 'p1',
  titulo_proposto: 'O erro do BC',
  status: 'aprovado',
  inicio_seg: 600,
  fim_seg: 1020,
  desvios: [],
  motivo_riscado: [],
} as unknown as Corte;

function comProvedores(no: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TooltipProvider>{no}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** O que a tela do editor desenha: o cabeçalho, a faixa, a linha do tempo e a barra da casca. */
function telaDoEditor() {
  publicado = null;
  const barra = montarBarraDoEditor({
    aprovado: true,
    brutoPronto: true,
    brutoOcupado: false,
    salvando: false,
    onAlternarVeredito: vi.fn(),
    onGerarBruto: vi.fn(),
    onIrParaPos: vi.fn(),
  });
  comProvedores(
    <BancadaChrome
      projetoId="p1"
      tituloLive="Live"
      cortes={[CORTE]}
      corte={CORTE}
      exportStatus={[]}
      caminhoDoCorte={(c) => `/projetos/p1/cortes/${c.id}?fase=1`}
      sub=""
      fire={false}
      sujo={false}
      salvando={false}
      brutoPronto
      brutoOcupado={false}
      onSalvar={vi.fn()}
      onToggleFire={vi.fn()}
      onAprovar={vi.fn()}
      riscar={{ onRiscar: vi.fn() }}
      barra={barra}
      semLista
    />,
  );
  return comProvedores(
    <>
      <CabecalhoDoCorte
        projetoId="p1"
        tituloLive="Live"
        duracaoLiveSeg={3600}
        cortes={[CORTE]}
        corte={CORTE}
        caminhoDoCorte={(c) => `/projetos/p1/cortes/${c.id}?fase=1`}
        comRiscados
      />
      <BrutoContextStrip inicioHms="00:10:00" fimHms="00:17:00" inicioSeg={600} currentTime={620} durSeg={420} liquidoSeg={400} intervaloAberto onToggleIntervalo={vi.fn()} onAplicarIntervalo={vi.fn()} />
      <TimelinePanel
        audioSrc=""
        waveformPeaksSrc=""
        inicioSeg={600}
        fimSeg={1020}
        desvios={[]}
        currentTime={620}
        playbackRate={1}
        onSeek={vi.fn()}
        onChangeSpeed={vi.fn()}
        onSetInicioAqui={vi.fn()}
        onSetFimAqui={vi.fn()}
        onAlternarVelocidade={vi.fn()}
      />
      <ActionBar barra={publicado!.barra!} />
    </>,
  );
}

describe('o editor na régua umPrimarioPorTela', () => {
  it('uma primária acesa: "Ir para a Pós"', () => {
    esperarPrimarios(telaDoEditor(), 'Editor');
  });
});
