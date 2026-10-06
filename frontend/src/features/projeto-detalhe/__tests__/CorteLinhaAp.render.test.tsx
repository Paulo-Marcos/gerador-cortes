import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { OverflowMenuItem } from '@/components/ui/overflow-menu';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { colunasDaLinha, CorteLinhaAp } from '../CorteLinhaAp';

// D-868 · a linha desenhada de verdade: selo, barra de 8 passos com o verbo,
// Editar e o principal com rótulo, o "⋯" — e nada do que existia some.
//
// Sem DOM não há clique. O que a linha liga às suas dependências (navegar,
// aprovar, voltar, abrir a pasta, a largura da janela) passa por substitutos
// que anotam a chamada; o "⋯" de verdade só abre com clique, então o seu
// substituto guarda o que a linha entregou a ele.
const h = vi.hoisted(() => ({
  navegar: vi.fn(),
  aprovar: vi.fn(),
  atualizar: vi.fn(),
  pasta: vi.fn(),
  pastaPendente: false,
  janelaLarga: true,
  limiares: [] as number[],
  primario: undefined as Record<string, () => void> | undefined,
  mais: undefined as
    | { items: OverflowMenuItem[]; label?: string; grande?: boolean; onAbertoMudou?: unknown }
    | undefined,
}));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => h.navegar,
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAprovar: () => ({ mutate: h.aprovar }),
  useAtualizarCorte: () => ({ mutate: h.atualizar }),
  useDeletarCorte: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', async (original) => ({
  ...(await original<typeof import('@/features/projeto-detalhe/useProjetoDetalhe')>()),
  useAbrirPasta: () => ({ mutate: h.pasta, isPending: h.pastaPendente }),
}));
vi.mock('@/upgrade/medidas', async (original) => ({
  ...(await original<typeof import('@/upgrade/medidas')>()),
  useJanelaMin: (px: number) => {
    h.limiares.push(px);
    return h.janelaLarga;
  },
}));
vi.mock('../acoesDaLinha', async (original) => {
  const real = await original<typeof import('../acoesDaLinha')>();
  return {
    ...real,
    primarioDaLinha: (...args: Parameters<typeof real.primarioDaLinha>) => {
      h.primario = args[1];
      return real.primarioDaLinha(...args);
    },
  };
});
vi.mock('@/components/ui/overflow-menu', async (original) => ({
  ...(await original<typeof import('@/components/ui/overflow-menu')>()),
  OverflowMenu: (props: NonNullable<typeof h.mais>) => {
    h.mais = props;
    return <button type="button" aria-label={props.label} />;
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  h.pastaPendente = false;
  h.janelaLarga = true;
  h.limiares = [];
});

type No = ReactElement<{ children?: unknown; onClick?: () => void; className?: string }>;

/** Os elementos que a linha devolve, descendo pelos `children` (sem
 *  renderizar os componentes filhos) — é onde moram os onClick da linha. */
function elementos(raiz: unknown): No[] {
  if (Array.isArray(raiz)) return raiz.flatMap(elementos);
  if (!raiz || typeof raiz !== 'object' || !('props' in raiz)) return [];
  const no = raiz as No;
  return [no, ...elementos(no.props.children)];
}

/** O texto que um elemento desenha, juntando o dos filhos. */
function textoDe(no: unknown): string {
  if (typeof no === 'string') return no;
  if (Array.isArray(no)) return no.map(textoDe).join('');
  if (no && typeof no === 'object' && 'props' in no) return textoDe((no as No).props.children);
  return '';
}

function arvoreDaLinha(corte: Partial<Corte> = {}, status: Partial<StatusExportCorte> = {}) {
  let artigo: No | undefined;
  function Sonda() {
    artigo = CorteLinhaAp(propsDaLinha(corte, status)) as No;
    return artigo;
  }
  comProvedores(<Sonda />);
  return elementos(artigo);
}

const botao = (arvore: No[], texto: string) =>
  arvore.find((e) => e.type === 'button' && textoDe(e).trim() === texto)!;

const props = {
  onEnviarYoutube: vi.fn(),
  onInformarUrl: vi.fn(),
  onLiberarPublicacao: vi.fn(),
};

function propsDaLinha(
  corte: Partial<Corte>,
  status: Partial<StatusExportCorte> = {},
  enviando = false,
) {
  return {
    projetoId: 'p1',
    corte: {
      id: 'c7',
      numero: 7,
      status: 'proposto',
      is_fire: false,
      inicio_seg: 0,
      fim_seg: 60,
      inicio_hms: '00:06:44',
      fim_hms: '00:19:59',
      ...corte,
    } as unknown as Corte,
    status: {
      ...statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Pedro II e a Igreja' }),
      ...status,
    },
    podeSubir: true,
    podeDescer: true,
    reordenando: false,
    onMover: vi.fn(),
    ...props,
    enviando,
    selecionado: false,
    onAlternarSelecao: vi.fn(),
  };
}

function comProvedores(filho: ReactElement) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>{filho}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function desenhar(corte: Partial<Corte>, status: Partial<StatusExportCorte> = {}, enviando = false) {
  return comProvedores(<CorteLinhaAp {...propsDaLinha(corte, status, enviando)} />);
}

const linha = (html: string) => html.slice(html.indexOf('<article'), html.indexOf('</article>'));
const fonte = readFileSync(resolve(__dirname, '../CorteLinhaAp.tsx'), 'utf8');

describe('CorteLinhaAp (D-868)', () => {
  it('estado em palavras: a barra de 8 passos diz o próximo, e as 11 siglas somem', () => {
    const html = linha(desenhar({}));
    expect(html).toContain('0 de 8 · próximo: gerar bruto');
    expect(html.match(/data-estado="/g)).toHaveLength(8);
    for (const sigla of ['>BRU<', '>GRD<', '>OVL<', '>FIN<', '>THU<', '>MET<', '>CENAS<', '>RENDER<'])
      expect(html).not.toContain(sigla);
  });

  it('o detalhe de cada etapa segue no hover do passo', () => {
    expect(linha(desenhar({}))).toMatch(/title="Bruto — é aqui que parou/);
  });

  it('uma ação por linha: Editar e o principal com rótulo, o resto no ⋯', () => {
    const html = linha(desenhar({}));
    expect(html).toMatch(/>Editar<\/button>/);
    expect(html).toMatch(/>Aprovar<\/button>/);
    expect(html).toContain('aria-label="Mais ações do corte 7"');
    for (const antigo of ['title="Pós-produção"', 'aria-label="Metadados do corte"', 'title="Abrir a pasta do corte"'])
      expect(html).not.toContain(antigo);
  });

  it('alvos de 32 px: Editar, o principal e o ⋯ (grande)', () => {
    const html = linha(desenhar({}));
    expect(html).toMatch(/style="height:32px"[^>]*>(?:<svg[^>]*>.*?<\/svg>)?Editar/);
    expect(html).toMatch(/style="height:32px"[^>]*>(?:<svg[^>]*>.*?<\/svg>)?Aprovar/);
    expect(h.mais!.grande).toBe(true);
  });

  it('nada some: seleção, ordem, abrir pelo título e pela miniatura, fire, selo e timecode', () => {
    const html = linha(desenhar({ is_fire: true }));
    expect(html).toContain('aria-label="Selecionar o corte #7"');
    expect(html).toContain('aria-label="Mover corte 7 para cima"');
    expect(html).toContain('aria-label="Mover corte 7 para baixo"');
    expect(html).toContain('Abrir o corte 7 no editor');
    expect(html).toContain('>Pedro II e a Igreja</button>');
    expect(html).toContain('title="Marcado como fire"');
    expect(html).toContain('>proposto<');
    expect(html).toContain('00:06:44 → 00:19:59');
  });
});

describe('CorteLinhaAp · o principal faz o que diz (D-868)', () => {
  it('Aprovar aprova; Voltar devolve a proposto', () => {
    desenhar({});
    h.primario!.aprovar();
    expect(h.aprovar).toHaveBeenCalledOnce();
    h.primario!.voltar();
    expect(h.atualizar.mock.calls[0][0]).toEqual({ status: 'proposto' });
  });

  it('Finalizar leva à Pós do corte; Enviar chama o envio que a tela passou', () => {
    desenhar({ status: 'aprovado' });
    h.primario!.finalizar();
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/post-production?corte=c7');
    h.primario!.enviarYoutube();
    expect(props.onEnviarYoutube).toHaveBeenCalledOnce();
  });

  it('Editar abre o corte no editor', () => {
    botao(arvoreDaLinha(), 'Editar').props.onClick!();
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/cortes/c7');
  });

  it('o principal forte é o do botão primário; Aprovar é o comum', () => {
    expect(botao(arvoreDaLinha({ status: 'aprovado' }), 'Finalizar').props.className).toBe('btn btn-pri');
    expect(botao(arvoreDaLinha(), 'Aprovar').props.className).toBe('btn');
  });

  it('aprovar que falha avisa (D-746)', () => {
    desenhar({});
    h.primario!.aprovar();
    expect(typeof h.aprovar.mock.calls[0][1].onError).toBe('function');
  });

  it('No ar abre o vídeo numa aba nova, sem acesso à janela do app', () => {
    const abrir = vi.fn();
    vi.stubGlobal('window', { open: abrir });
    desenhar({ status: 'aprovado' }, { youtube_url_publicado: 'https://youtu.be/x' });
    h.primario!.abrirNoYoutube();
    vi.unstubAllGlobals();
    expect(abrir).toHaveBeenCalledWith('https://youtu.be/x', '_blank', 'noopener,noreferrer');
  });

  it('enviando, o "Enviar ao YouTube" fica desligado e gira', () => {
    const html = linha(desenhar({ status: 'aprovado' }, { pronto_publicar: true }, true));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*lucide-loader(?:(?!<\/button>).)*Enviar ao YouTube/);
  });
});

describe('CorteLinhaAp · o ⋯ (D-868)', () => {
  const item = (rotulo: string) => h.mais!.items.find((i) => i.label === rotulo)!;

  it('entrega ao ⋯ os itens que eram ícones soltos', () => {
    desenhar({});
    expect(h.mais!.items.map((i) => i.label)).toEqual([
      'Pós-produção',
      'Metadados do corte',
      'Abrir a pasta do corte',
      'Informar a URL publicada',
    ]);
  });

  it('Pós leva à Pós do corte; a pasta abre a do corte e fica travada enquanto abre', () => {
    desenhar({});
    item('Pós-produção').onClick!();
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/post-production?corte=c7');
    item('Abrir a pasta do corte').onClick!();
    expect(h.pasta).toHaveBeenCalledWith('c7');
    h.pastaPendente = true;
    desenhar({});
    expect(item('Abrir a pasta do corte').disabled).toBe(true);
  });

  it('Metadados abre o modal aqui, sem sair da lista', () => {
    // O estado do modal só muda depois de um clique de verdade (sem DOM aqui):
    // confere-se a ligação; o modal abrindo foi visto no navegador.
    expect(fonte).toContain('metadados: () => setMetaAberto(true),');
  });

  it('os itens de publicação chamam o que a tela passou à linha', () => {
    desenhar({});
    item('Informar a URL publicada').onClick!();
    expect(props.onInformarUrl).toHaveBeenCalledOnce();
    desenhar({}, { tiktok_publicado_em: '2026-10-01T10:00:00' });
    item('Liberar publicação').onClick!();
    expect(props.onLiberarPublicacao).toHaveBeenCalledOnce();
  });

  it('a linha sobe de camada enquanto o SEU ⋯ está aberto, não enquanto tem o foco', () => {
    desenhar({});
    expect(typeof h.mais!.onAbertoMudou).toBe('function');
    expect(fonte).toContain('onAbertoMudou={setMaisAberto}');
    expect(fonte).toMatch(/position: 'relative',\s*zIndex: maisAberto \? 3 : undefined,/);
  });
});

describe('CorteLinhaAp · a barra e a largura (D-868)', () => {
  it('cada passo tem cor E forma: feito cheio, agora vazado, falta no traço da linha', () => {
    const html = linha(desenhar({}, { raw_pronto: true }));
    expect(html).toMatch(/data-estado="feito"[^>]*background:var\(--ok\)/);
    expect(html).toMatch(/data-estado="agora"[^>]*box-shadow:inset 0 0 0 1.5px var\(--warn\)/);
    expect(html).toMatch(/data-estado="falta"[^>]*background:var\(--line\)/);
  });

  it('a frase não corta: quebra, e fica inteira no hover', () => {
    const html = linha(
      desenhar({}, {
        raw_pronto: true,
        cenas_geradas: true,
        cenas_validadas: true,
        grade_pronta: true,
        overlays_prontos: true,
        video_pronto: true,
        thumbnail_pronta: true,
      }),
    );
    const frase = '6 de 8 · próximo: completar metadados';
    expect(html).toContain(`title="${frase}"`);
    expect(html).toContain(`>${frase}</span>`);
    expect(html).not.toMatch(/text-overflow:ellipsis[^>]*>6 de 8/);
  });

  it('os passos têm 6 px e ficam fora do leitor de tela — a frase diz o mesmo', () => {
    const html = linha(desenhar({}));
    expect(html.match(/data-estado="[a-z]+"[^>]*height:6px/g)).toHaveLength(8);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>(?:<span data-estado)/);
  });

  it('o corte rejeitado pinta o passo de erro e diz isso', () => {
    const html = linha(desenhar({ status: 'rejeitado' }));
    expect(html).toMatch(/data-estado="rejeitado"[^>]*background:var\(--err\)/);
    expect(html).toContain('corte rejeitado');
  });

  it('janela larga: a barra tem coluna própria', () => {
    expect(colunasDaLinha(true, true)).toBe('16px 24px 96px minmax(0, 1fr) 190px auto');
    const html = linha(desenhar({}));
    expect(html).toContain('grid-template-columns:16px 24px 96px minmax(0, 1fr) 190px auto');
    expect(html).not.toContain('max-width:260px');
  });

  it('a régua da largura é a de 1200 px, e a barra aparece uma vez só nos dois layouts', () => {
    desenhar({});
    expect(h.limiares).toContain(1200);
    expect(linha(desenhar({})).match(/data-estado="/g)).toHaveLength(8);
    h.janelaLarga = false;
    expect(linha(desenhar({})).match(/data-estado="/g)).toHaveLength(8);
  });

  it('janela estreita: a barra desce para baixo do título, que não perde espaço', () => {
    expect(colunasDaLinha(false, false)).toBe('24px 96px minmax(0, 1fr) auto');
    h.janelaLarga = false;
    const html = linha(desenhar({}));
    expect(html).toContain('grid-template-columns:16px 24px 96px minmax(0, 1fr) auto');
    const timecode = html.indexOf('00:06:44');
    const barra = html.indexOf('max-width:260px');
    expect(timecode).toBeGreaterThan(-1);
    expect(barra).toBeGreaterThan(timecode);
    expect(html.indexOf('data-estado')).toBeGreaterThan(barra);
    expect(html.indexOf('data-estado')).toBeLessThan(html.indexOf('Editar'));
  });
});

describe('CorteLinhaAp · teclado (D-868)', () => {
  // A linha chamada como função dentro de uma sonda devolve o <article>, e o
  // onKeyDown dele é o que o React chamaria na tecla.
  function teclar(tecla: string, dentroDoMenu: boolean) {
    let artigo: ReactElement<{ onKeyDown: (e: unknown) => void }> | undefined;
    function Sonda() {
      artigo = CorteLinhaAp(propsDaLinha({})) as typeof artigo;
      return artigo!;
    }
    comProvedores(<Sonda />);
    artigo!.props.onKeyDown({
      key: tecla,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: {},
      target: { closest: (sel: string) => (dentroDoMenu && sel.includes('[role="menu"]') ? {} : null) },
    });
  }

  it('A na linha aprova', () => {
    teclar('a', false);
    expect(h.aprovar).toHaveBeenCalledOnce();
  });

  it('A com o foco dentro do ⋯ não aprova o corte de trás', () => {
    teclar('a', true);
    expect(h.aprovar).not.toHaveBeenCalled();
  });

  it('com o ⋯ da linha aberto, as teclas da linha se calam', () => {
    expect(fonte).toContain('sobreposicaoAberta: metaAberto || maisAberto || porQueAberto,');
  });
});
