import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';
import { SHORTCUTS_REGISTRY } from '@/shared/atalhos/shortcutsRegistry';
import type { Desvio } from '@/types/models';

// D-1095 (E7): a Sincronia do áudio saiu do player e virou a pergunta 3 da aba
// Decisões, "O som bate com a boca?".

// O SSR não roda efeitos: o efeito da pergunta fica guardado para o teste chamar.
const h = vi.hoisted(() => ({ efeitos: [] as (() => unknown)[] }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (efeito: () => unknown) => {
    h.efeitos.push(efeito);
  },
}));
vi.mock('@/features/editor/useCortes', async () => {
  const actual = await vi.importActual<typeof import('@/features/editor/useCortes')>('@/features/editor/useCortes');
  return { ...actual, useCorte: () => ({ data: { projeto_id: 'p1' } }) };
});
vi.mock('@/features/diarizacao/useDiarizacao', async () => {
  const actual = await vi.importActual<typeof import('@/features/diarizacao/useDiarizacao')>(
    '@/features/diarizacao/useDiarizacao',
  );
  return {
    ...actual,
    useFalantes: () => ({ data: { falantes: {} } }),
    useDiarizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

const { RightTabsPanel } = await import('../RightTabsPanel');
const { PerguntaDoSom } = await import('../PerguntaDoSom');
const { PlayerPanel } = await import('../PlayerPanel');
const { useSomDoCorte } = await import('../useSomDoCorte');
type SomDoCorte = import('../useSomDoCorte').SomDoCorte;

const noop = vi.fn();
const SILENCIO: Desvio = { inicio_hms: '00:05:05', fim_hms: '00:05:22', motivo: '', categoria: 'silencio', origem: 'tecnico' };

function somDe(parcial: Partial<SomDoCorte> = {}): SomDoCorte {
  return {
    offsetMs: 0,
    mudarOffset: vi.fn(),
    podeOuvir: true,
    ouvindo: false,
    estadoDoPreview: 'desligado',
    alternarOuvir: vi.fn(),
    pararDeOuvir: vi.fn(),
    certo: false,
    marcarCerto: vi.fn(),
    ...parcial,
  };
}

function envolver(no: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TooltipProvider>{no}</TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function painel(som?: SomDoCorte) {
  return envolver(
    <RightTabsPanel
      corteId="c1"
      desvios={[SILENCIO]}
      selectedDesvioIdx={null}
      onSeek={noop}
      onGerarManual={noop}
      onGerarTrechosIA={noop}
      pendingTrechos={{}}
      transcricao={[]}
      currentTime={0}
      onAtualizarTranscricao={noop}
      transcricaoAtualizando={false}
      som={som}
    />,
  );
}

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(abrir(el))];
}
/** Abre os componentes sem hook da pergunta, para achar os botões e clicar; dos outros, só os filhos. */
function abrir(el: Elemento): ReactNode {
  const tipo = el.type as (p: unknown) => ReactNode;
  const semHook = typeof tipo === 'function' && ['AudioSyncControl', 'PerguntaDaDecisao'].includes(tipo.name);
  return semHook ? tipo(el.props) : (el.props.children as ReactNode);
}

/** O texto de um elemento, juntando os filhos, sem passar pelo HTML. */
function textoDe(no: ReactNode): string {
  if (typeof no === 'string' || typeof no === 'number') return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join('');
  return isValidElement(no) ? textoDe(abrir(no as Elemento)) : '';
}

/** A árvore da pergunta, montada dentro de um render (onde os hooks valem). */
function arvoreDaPergunta(som: SomDoCorte): Elemento[] {
  let arvore: Elemento[] = [];
  function Sonda() {
    arvore = elementos(PerguntaDoSom({ som }));
    return null;
  }
  renderToStaticMarkup(<Sonda />);
  return arvore;
}
const botao = (arvore: Elemento[], rotulo: string) =>
  arvore.find((e) => e.type === 'button' && e.props['aria-label'] === rotulo)!;

describe('a pergunta 3 na aba Decisões (D-1095)', () => {
  it('vem depois das perguntas 1 e 2, com o título do design', () => {
    const html = painel(somDe());
    const silencio = html.indexOf('1 · Tirar o silêncio?');
    const desvios = html.indexOf('2 · Tirar os desvios de assunto?');
    const som = html.indexOf('3 · O som bate com a boca?');
    expect(silencio).toBeGreaterThan(-1);
    expect(desvios).toBeGreaterThan(silencio);
    expect(som).toBeGreaterThan(desvios);
    expect(html).toContain('aria-label="Pergunta sobre o som"');
  });

  it('o cabeçalho diz o deslocamento atual, com o sinal da faixa do bruto', () => {
    expect(painel(somDe({ offsetMs: 0 }))).toMatch(/O som bate com a boca\?<\/h3><span[^>]*>0 ms<\/span>/);
    expect(painel(somDe({ offsetMs: 40 }))).toMatch(/O som bate com a boca\?<\/h3><span[^>]*>\+40 ms<\/span>/);
    expect(painel(somDe({ offsetMs: -120 }))).toMatch(/O som bate com a boca\?<\/h3><span[^>]*>-120 ms<\/span>/);
  });

  it('diz o que muda e o que fica', () => {
    const paragrafo = arvoreDaPergunta(somDe()).find((e) => e.type === 'p')!;
    expect(textoDe(paragrafo)).toBe('Muda: só o áudio anda. Fica: o vídeo, as bordas e os trechos.');
  });

  it('mostra os quatro passos, na ordem', () => {
    const html = painel(somDe());
    const passos = [...html.matchAll(/aria-label="((?:Adiantar|Atrasar) áudio \d+ms)"/g)].map((m) => m[1]);
    expect(passos).toEqual(['Adiantar áudio 100ms', 'Adiantar áudio 10ms', 'Atrasar áudio 10ms', 'Atrasar áudio 100ms']);
  });

  it('fora do editor (sem o som) a pergunta não aparece', () => {
    expect(painel()).not.toContain('O som bate com a boca?');
  });
});

describe('"Está certo" (decisão do Paulo, 10/11/2026: opção A)', () => {
  const certoDe = (som: SomDoCorte) =>
    arvoreDaPergunta(som).find((e) => e.type === 'button' && e.props.children === 'Está certo')!;

  it('fica na linha dos passos, depois do +100, ainda não marcado', () => {
    const html = painel(somDe());
    expect(html).toMatch(/Atrasar áudio 100ms"[^>]*>\+100<\/button><button[^>]*aria-pressed="false"[^>]*>Está certo<\/button>/);
  });

  it('o clique marca a pergunta como respondida', () => {
    const som = somDe();
    (certoDe(som).props.onClick as () => void)();
    expect(som.marcarCerto).toHaveBeenCalledOnce();
  });

  it('respondida, aparece marcada como o "Tirar todos" da pergunta 1, e não se repete', () => {
    const som = somDe({ certo: true });
    expect(painel(som)).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Está certo<\/button>/);
    expect(certoDe(som).props.onClick).toBeUndefined();
  });
});

describe('o que saiu do controle (decisão do Paulo, 10/11/2026)', () => {
  it('sem a régua e sem o resetar; o fone e os passos ficam', () => {
    const html = painel(somDe({ offsetMs: 40 }));
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain('resetar');
    expect(html).toContain('aria-label="Preview de sincronia de áudio"');
  });

  it('o número só no cabeçalho da pergunta', () => {
    const html = painel(somDe({ offsetMs: 40 }));
    expect(html.match(/\+40/g)).toHaveLength(1);
  });
});

describe('os passos andam só com o áudio (D-1095)', () => {
  it.each([
    ['Adiantar áudio 100ms', -60],
    ['Adiantar áudio 10ms', 30],
    ['Atrasar áudio 10ms', 50],
    ['Atrasar áudio 100ms', 140],
  ])('%s leva +40 para %i', (rotulo, esperado) => {
    const som = somDe({ offsetMs: 40 });
    (botao(arvoreDaPergunta(som), rotulo).props.onClick as () => void)();
    expect(som.mudarOffset).toHaveBeenCalledWith(esperado);
  });

  it('o fone da pergunta liga o preview do player', () => {
    const som = somDe();
    (botao(arvoreDaPergunta(som), 'Preview de sincronia de áudio').props.onClick as () => void)();
    expect(som.alternarOuvir).toHaveBeenCalledOnce();
  });

  it('sair da pergunta desliga o fone (vídeo mudo com o interruptor fora de vista, D-601)', () => {
    const som = somDe();
    h.efeitos.length = 0;
    arvoreDaPergunta(som);
    const limpezas = h.efeitos.map((efeito) => efeito());
    expect(limpezas).toContain(som.pararDeOuvir);
  });
});

describe('o player sem a Sincronia (D-1095)', () => {
  it('nem o botão nem a faixa: só o preview, que a pergunta liga', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <PlayerPanel src="" inicioSeg={0} fimSeg={60} audioPreviewSrc="/a.flac" audioOffsetMs={40} />
      </TooltipProvider>,
    );
    expect(html).not.toContain('Sincronia do áudio');
    expect(html).not.toContain('aria-label="Adiantar áudio 10ms"');
    expect(html).toContain('<audio');
  });

  it('o EditorFase1 entrega o mesmo som ao player e à pergunta', () => {
    let resultado: ReturnType<typeof useSomDoCorte> | undefined;
    const mudar = vi.fn();
    function Sonda() {
      resultado = useSomDoCorte({ corteId: 'c1', audioPreviewSrc: '/a.flac', audioPreviewStartSec: 12, audioOffsetMs: -30, onAudioOffsetChange: mudar });
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    const { som, noPlayer } = resultado!;
    expect(som).toMatchObject({ offsetMs: -30, mudarOffset: mudar, podeOuvir: true, ouvindo: false, estadoDoPreview: 'desligado', certo: false });
    expect(noPlayer).toMatchObject({ audioPreviewSrc: '/a.flac', audioPreviewStartSec: 12, audioOffsetMs: -30, ouvirSincronia: false });
    expect(noPlayer.onEstadoDaSincronia).toBeTypeOf('function');
  });

  it('sem proxy de áudio não há o que ouvir', () => {
    let som: SomDoCorte | undefined;
    function Sonda() {
      som = useSomDoCorte({ corteId: 'c1', onAudioOffsetChange: noop }).som;
      return null;
    }
    renderToStaticMarkup(<Sonda />);
    expect(som).toMatchObject({ offsetMs: 0, podeOuvir: false, ouvindo: false });
  });

  it('a bancada passa o som para a coluna da direita e o fone para o player', () => {
    const fonte = readFileSync(resolve(__dirname, '../EditorFase1.tsx'), 'utf-8');
    expect(fonte).toMatch(/<PlayerPanel[\s\S]*\{\.\.\.noPlayer\}[\s\S]*\/>/);
    expect(fonte).toMatch(/<RightTabsPanel[\s\S]*som=\{som\}[\s\S]*\/>/);
  });
});

describe('Ctrl+, e Ctrl+. continuam andando 10 ms (D-1095)', () => {
  it('os atalhos seguem no registro, com o Ctrl', () => {
    const menos = SHORTCUTS_REGISTRY.find((s) => s.id === 'bruto.sincroniaNudgeMenos');
    const mais = SHORTCUTS_REGISTRY.find((s) => s.id === 'bruto.sincroniaNudgeMais');
    expect(menos).toMatchObject({ key: ',', mod: 'ctrl', screen: 'bruto' });
    expect(mais).toMatchObject({ key: '.', mod: 'ctrl', screen: 'bruto' });
  });

  it('e chamam o nudgeSincronia do editor, que grava o mesmo audio_offset_ms da pergunta', () => {
    const fonte = readFileSync(resolve(__dirname, '../../useEditorPage.tsx'), 'utf-8');
    expect(fonte).toContain("'bruto.sincroniaNudgeMenos': () => nudgeSincronia(-STEP_FINO)");
    expect(fonte).toContain("'bruto.sincroniaNudgeMais': () => nudgeSincronia(STEP_FINO)");
    expect(fonte).toMatch(/function nudgeSincronia[\s\S]*?patchDirty\(\{ audio_offset_ms: next \}\)/);
  });
});
