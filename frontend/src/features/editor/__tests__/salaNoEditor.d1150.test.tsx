import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { montarBarraDoEditor } from '../acoesDoEditor';
import { BrutoContextStrip } from '../fase1/BrutoContextStrip';
import { TimelinePanel } from '../fase1/TimelinePanel';
import { SecaoDosRiscados } from '../RiscadosDaLista';

// D-1150 (E-069 H-17): o editor na Sala escura.
// - Sem `backdrop-filter` em nenhum arquivo da tela: ela toca vídeo (DIRECAO §3.6).
// - Uma primária só, "Ir para a Pós" (§5). A régua `umPrimarioPorTela` conta
//   `data-variant="primary"`, que o botão novo não emite (D-1138); aqui se conta o que ele
//   emite de fato, `data-variant="primario"`.
// - Escala de fonte, sem `style` de aparência, `data-sala` e foco de verdade (§8.2).

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

const RAIZ = resolve(__dirname, '../../..');
// O código, sem os comentários: o porquê pode citar o que o arquivo não faz.
const ler = (rel: string) =>
  readFileSync(resolve(RAIZ, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Os arquivos da tela que a H-17 redesenhou (fora a `fase2/`, que é da H-18). */
const DA_TELA = [
  'features/editor/EditorPage.tsx',
  'features/editor/BancadaChrome.tsx',
  'features/editor/CabecalhoDoCorte.tsx',
  'features/editor/RiscadosDaLista.tsx',
  'features/editor/PendenciasDoCorte.tsx',
  'features/editor/AvisoDoRiscado.tsx',
  'features/editor/avisoDaJuncao.tsx',
  'features/editor/salaDoEditor.ts',
  'features/editor/BotaoModoFoco.tsx',
  'features/editor/fase1/EditorFase1.tsx',
  'features/editor/fase1/PlayerPanel.tsx',
  'features/editor/fase1/OuvirEmenda.tsx',
  'features/editor/fase1/BrutoContextStrip.tsx',
  'features/editor/fase1/TimelinePanel.tsx',
  'features/editor/fase1/LegendaDaTimeline.tsx',
  'features/editor/fase1/FaixaDoBruto.tsx',
  'features/editor/fase1/RightTabsPanel.tsx',
  'features/editor/fase1/DecisoesDoCorte.tsx',
  'features/editor/fase1/PerguntaDoSilencio.tsx',
  'features/editor/fase1/PerguntaDoSom.tsx',
  'features/editor/fase1/AudioSyncControl.tsx',
  'features/editor/fase1/LinhaDoTrecho.tsx',
  'features/editor/fase1/agulhaDaOnda.ts',
  'features/editor/fase1/origemDaBorda.ts',
  'features/porque-do-corte/PorQueDoCorteModal.tsx',
  'features/porque-do-corte/MudancasDoCorte.tsx',
  'features/porque-do-corte/SeloDaNota.tsx',
  'upgrade/UmaTelaPorCorte.tsx',
];

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

describe('o editor sem desfoque (§3.6)', () => {
  it.each(DA_TELA)('%s não pede backdrop-filter', (arquivo) => {
    expect(ler(arquivo)).not.toMatch(/backdrop-filter|backdrop-blur|backdropFilter|cc-vidro-casca/);
  });
});

describe('uma primária só: "Ir para a Pós" (§5)', () => {
  it('a tela inteira, com a barra, tem exatamente um data-variant="primario"', () => {
    const html = telaDoEditor();
    const primarios = html.match(/<button[^>]*data-variant="primario"[^>]*>/g) ?? [];
    expect(primarios).toHaveLength(1);
    expect(html).toMatch(/data-variant="primario"[^>]*>(?:(?!<\/button>).)*Ir para a Pós/);
  });
});

describe('escala, estilo, data-sala e foco (§8.2)', () => {
  it.each(DA_TELA)('%s: sem style de aparência, sem px solto na fonte, sem caixa alta', (arquivo) => {
    const fonte = ler(arquivo);
    // Só variável de geometria entra por `style` (DIRECAO §9.3).
    for (const m of fonte.matchAll(/style=\{\{\s*([^}]*)\}\}/g)) expect(m[1].trim()).toMatch(/^'--/);
    expect(fonte).not.toMatch(/text-\[\d+(?:\.\d+)?px\]/);
    expect(fonte).not.toMatch(/\buppercase\b|textTransform/);
    expect(fonte).not.toMatch(/var\(--wb-/);
  });

  it('todo botão da tela é da Sala e traz o próprio anel de foco', () => {
    const html =
      telaDoEditor() +
      comProvedores(<SecaoDosRiscados riscados={[{ ...CORTE, id: 'r', status: 'rejeitado' } as Corte]} onTrazerDeVolta={vi.fn()} />);
    const naTela = html.match(/<button[^>]*>/g) ?? [];
    expect(naTela.length).toBeGreaterThan(10);
    // A barra é da casca (H-13); o que o editor desenha é que precisa cumprir.
    const doEditor = naTela.filter((b) => !b.includes('data-decisao') && !b.includes('data-alternancia'));
    for (const botao of doEditor) {
      expect(botao, botao).toContain('data-sala=""');
      expect(botao, botao).toMatch(/focus-visible:outline-foco|focus-visible:ring/);
    }
  });
});
