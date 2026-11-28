import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';
import { EnviarAoYoutubeDialog, InformarLinkDialog, LiberarPublicacaoDialog } from '../DialogosDaLinha';
import {
  abertoNaLista,
  cortesDoMapa,
  estadoNoMapa,
  fraseDoFire,
  fraseDosCortes,
  metadesDoTitulo,
  percentualCortado,
  SELO_DO_CORTE,
} from '../leituraDoMapa';
import { useCorteAberto } from '../useCorteAberto';
import { colunasDaLinha, titulosDasColunas } from '../colunasDaLista';
import { useCapaQueCarrega } from '../PartesDaLinha';

// D-1149 (E-069 H-16) · As peças da tela dos cortes da live: a regra pura do mapa, o corte
// aberto que o mapa e a lista dividem, o medidor no lugar da barra antiga e os três diálogos
// que saíram do UpgradeModal.

const status = (id: string, numero: number, extra: Partial<StatusExportCorte> = {}) => ({
  ...statusExportPendente({ corte_id: id, numero, titulo: `Corte ${numero}` }),
  ...extra,
});
const corte = (id: string, estado: string, inicio: number, fim: number) =>
  ({ id, status: estado, inicio_seg: inicio, fim_seg: fim }) as unknown as Corte;

describe('D-1149 · a regra do mapa', () => {
  it('o mapa fala em luz: pronto e no ar acendem, riscado é contorno, aprovado e proposto ficam apagados', () => {
    expect(estadoNoMapa('pronto')).toBe('pronto');
    expect(estadoNoMapa('publicado')).toBe('pronto');
    expect(estadoNoMapa('rejeitado')).toBe('riscado');
    expect(estadoNoMapa('aprovado')).toBe('aprovado');
    expect(estadoNoMapa('proposto')).toBe('proposto');
  });

  it('cada linha com corte vira um corte do mapa, que aponta para a própria linha', () => {
    const cortes = cortesDoMapa([
      { status: status('a', 1, { pronto_publicar: true }), corte: corte('a', 'aprovado', 10, 70) },
      { status: status('b', 2), corte: undefined },
    ]);
    expect(cortes).toEqual([
      { id: 'a', numero: 1, nome: 'Corte 1', inicioSeg: 10, fimSeg: 70, estado: 'pronto', href: '#corte-a' },
    ]);
  });

  it('quanto da live virou corte: sobreposição conta uma vez, riscado não conta, sem duração não há', () => {
    const c = (inicioSeg: number, fimSeg: number, estado: 'proposto' | 'riscado' = 'proposto') => ({
      id: `${inicioSeg}`,
      numero: 1,
      nome: '',
      inicioSeg,
      fimSeg,
      estado,
    });
    expect(percentualCortado([c(0, 600), c(300, 900)], 3600)).toBe(25);
    expect(percentualCortado([c(0, 600), c(1800, 3600, 'riscado')], 3600)).toBe(17);
    expect(percentualCortado([c(3000, 4000)], 3600)).toBe(17);
    expect(percentualCortado([c(0, 600)], 0)).toBeNull();
  });

  it('as frases da leitura', () => {
    expect(fraseDosCortes(6, 6)).toBe('6 cortes · todos prontos');
    expect(fraseDosCortes(6, 2)).toBe('6 cortes · 2 prontos');
    expect(fraseDosCortes(1, 1)).toBe('1 corte · pronto');
    expect(fraseDosCortes(3, 0)).toBe('3 cortes · nenhum pronto');
    expect(fraseDosCortes(0, 0)).toBe('Nenhum corte ainda');
    expect(fraseDoFire(2)).toBe('2 fire · viram shorts');
    expect(fraseDoFire(1)).toBe('1 fire · vira short');
    expect(fraseDoFire(0)).toBeNull();
  });

  it('o título em duas metades; uma palavra só vai inteira na metade forte', () => {
    expect(metadesDoTitulo('Pedro e a Igreja no Império')).toEqual(['Pedro e a', 'Igreja no Império']);
    expect(metadesDoTitulo('Live')).toEqual(['', 'Live']);
    expect(metadesDoTitulo('')).toEqual(['', '']);
  });

  it('o selo de cada estado é a palavra da tela, com maiúscula (§5)', () => {
    expect(SELO_DO_CORTE).toEqual({
      proposto: { tom: 'neutro', texto: 'Proposto' },
      aprovado: { tom: 'neutro', texto: 'Aprovado' },
      pronto: { tom: 'convite', texto: 'Pronto' },
      publicado: { tom: 'ok', texto: 'No ar' },
      rejeitado: { tom: 'inerte', texto: 'Riscado' },
    });
  });

  it('o corte aberto só vale se está na lista', () => {
    const linhas = [{ status: status('a', 1), corte: undefined }];
    expect(abertoNaLista('a', linhas)).toBe('a');
    expect(abertoNaLista('z', linhas)).toBeUndefined();
    expect(abertoNaLista(null, linhas)).toBeUndefined();
  });
});

describe('D-1149 · o corte aberto, dividido entre o mapa e a lista', () => {
  let limpar: () => Promise<void> = async () => undefined;
  afterEach(async () => {
    await limpar();
    limpar = async () => undefined;
  });

  async function sonda(url: string) {
    const visto: { atual?: ReturnType<typeof useCorteAberto> } = {};
    function Sonda() {
      visto.atual = useCorteAberto();
      return null;
    }
    ({ limpar } = montar(
      <MemoryRouter initialEntries={[url]}>
        <Sonda />
      </MemoryRouter>,
    ));
    await assentar();
    return visto;
  }

  it('começa no ?corte= da chegada', async () => {
    expect((await sonda('/projetos/p1?corte=c4')).atual!.abertoId).toBe('c4');
    expect((await sonda('/projetos/p1')).atual!.abertoId).toBeNull();
  });

  it('clicar no mapa abre o corte e leva o foco à linha dele, que vem à vista', async () => {
    const visto = await sonda('/projetos/p1');
    const linha = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const achar = vi.fn(() => linha);
    (globalThis.document as unknown as { getElementById: typeof achar }).getElementById = achar;
    visto.atual!.abrirPeloMapa('c2');
    await assentar();
    expect(achar).toHaveBeenCalledWith('corte-c2');
    expect(linha.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(linha.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(visto.atual!.abertoId).toBe('c2');
  });

  it('a linha que recebe o foco abre o seu corte (o mapa acende)', async () => {
    const visto = await sonda('/projetos/p1?corte=c1');
    visto.atual!.abrirPelaLinha('c3');
    await assentar();
    expect(visto.atual!.abertoId).toBe('c3');
  });
});

describe('D-1149 · a linha: medidor de etapas, ação em texto, foco que abre', () => {
  const props = (extra: Partial<Parameters<typeof CorteLinhaAp>[0]> = {}) => ({
    projetoId: 'p1',
    corte: { id: 'c7', numero: 7, status: 'aprovado', inicio_seg: 0, fim_seg: 60, inicio_hms: '00:00:00', fim_hms: '00:01:00' } as unknown as Corte,
    status: status('c7', 7, { raw_pronto: true }),
    podeSubir: true,
    podeDescer: true,
    reordenando: false,
    onMover: vi.fn(),
    onEnviarYoutube: vi.fn(),
    onInformarUrl: vi.fn(),
    onLiberarPublicacao: vi.fn(),
    enviando: false,
    ...extra,
  });
  const desenhar = (p = props()) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MemoryRouter>
            <CorteLinhaAp {...p} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

  it('o "o que falta" é o MedidorDeEtapas: oito traços com nome, frase e o rótulo para o leitor de tela', () => {
    const html = desenhar();
    expect(html).toContain('aria-label="Etapas do corte: 1 de 8 · próximo: gerar cenas"');
    expect(html.match(/data-etapa="/g)).toHaveLength(8);
    expect(html).toMatch(/data-etapa="Bruto" data-estado="feito"/);
    expect(html).toMatch(/data-etapa="Cenas" data-estado="agora"/);
  });

  it('o corte riscado pinta as etapas com "falha", a palavra do medidor', () => {
    const p = props({ corte: { ...props().corte!, status: 'rejeitado' } as Corte });
    expect(desenhar(p)).toMatch(/data-estado="falha"/);
  });

  it('a barra antiga saiu de vez: nem o arquivo nem o import', () => {
    expect(existsSync(resolve(__dirname, '../../../upgrade/BarraDoCorte.tsx'))).toBe(false);
    expect(readFileSync(resolve(__dirname, '../CorteLinhaAp.tsx'), 'utf8')).not.toContain('BarraDoCorte');
  });

  it('a ação da linha é texto (LinkDeAcao), uma só, e o foco na linha abre o corte', () => {
    const onAbrir = vi.fn();
    let artigo: ReactElement<{ onFocus?: () => void; id?: string }> | undefined;
    function Sonda() {
      artigo = CorteLinhaAp(props({ onAbrir })) as typeof artigo;
      return artigo!;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MemoryRouter>
            <Sonda />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(html.match(/data-variant="link-de-acao"/g)).toHaveLength(1);
    expect(html).not.toMatch(/class="btn\b/);
    expect(artigo!.props.id).toBe('corte-c7');
    artigo!.props.onFocus!();
    expect(onAbrir).toHaveBeenCalledOnce();
  });
});

describe('D-1149 · o que a rodada no navegador acertou', () => {
  let limpar: () => Promise<void> = async () => undefined;
  afterEach(async () => {
    await limpar();
    limpar = async () => undefined;
  });

  it('a capa que não carrega some (fica o desenho vazio); capa nova tenta de novo', async () => {
    const visto: { atual?: ReturnType<typeof useCapaQueCarrega> } = {};
    let src = '/thumb.png?v=1';
    function Sonda() {
      visto.atual = useCapaQueCarrega(src);
      return null;
    }
    const montado = montar(<Sonda />);
    limpar = montado.limpar;
    await assentar();
    expect(visto.atual!.src).toBe('/thumb.png?v=1');
    visto.atual!.aoFalhar();
    await assentar();
    expect(visto.atual!.src).toBeUndefined();
    src = '/thumb.png?v=2';
    montado.desmontar();
    ({ limpar } = montar(<Sonda />));
    await assentar();
    expect(visto.atual!.src).toBe('/thumb.png?v=2');
  });

  it('a linha liga o erro da imagem ao invólucro da capa (o React o faz subir da <img>)', () => {
    const fonte = readFileSync(resolve(__dirname, '../PartesDaLinha.tsx'), 'utf8');
    expect(fonte).toContain('<Miniatura src={visivel.src} onError={visivel.aoFalhar} riscada={riscada} />');
  });

  it('nenhuma coluna mede o conteúdo: cada <li> é uma grade, e as linhas alinham com o cabeçalho', () => {
    for (const [sel, col] of [
      [true, true],
      [true, false],
      [false, true],
    ] as const) {
      expect(colunasDaLinha(sel, col)).not.toMatch(/\b(?:auto|max-content|min-content|fit-content)\b/);
      expect(titulosDasColunas(sel, col)).toHaveLength(colunasDaLinha(sel, col).split(/ (?![^(]*\))/).length);
    }
  });

  it('o ⋯ abre o diálogo com o foco na linha: fechado, o foco volta a ela, não ao <body>', () => {
    const fonte = readFileSync(resolve(__dirname, '../CorteLinhaAp.tsx'), 'utf8');
    expect(fonte).toContain('informarUrl: pelaLinha(onInformarUrl),');
    expect(fonte).toContain('liberarPublicacao: pelaLinha(onLiberarPublicacao),');
    expect(fonte).toMatch(/const pelaLinha = \(abrir: \(\) => void\) => \(\) => \{\s*refDaLinha\.current\?\.focus\(\{ preventScroll: true \}\);\s*abrir\(\);/);
  });
});

describe('D-1149 · os três diálogos da linha saem do UpgradeModal para o Dialog', () => {
  const fonte = readFileSync(resolve(__dirname, '../WorkspaceProjetoPage.tsx'), 'utf8');
  const s = status('c7', 7, { titulo_youtube: 'Título no YouTube', youtube_url_publicado: 'https://youtu.be/x' });

  it('a tela não usa mais o UpgradeModal nem o ModalFields', () => {
    expect(fonte).not.toMatch(/UpgradeModal|ModalFields|ModalText/);
    for (const d of ['EnviarAoYoutubeDialog', 'InformarLinkDialog', 'LiberarPublicacaoDialog'])
      expect(fonte).toContain(`<${d}`);
  });

  it('enviar ao YouTube: conferência com o canal, a capa e o agendar; a primária envia', () => {
    const aoEnviar = vi.fn();
    const html = renderToStaticMarkup(
      <EnviarAoYoutubeDialog
        corte={s}
        canal={{ nome: 'Canal', handle: '@canal' }}
        capa="/capa.jpg"
        agendarEm=""
        setAgendarEm={vi.fn()}
        aoFechar={vi.fn()}
        aoEnviar={aoEnviar}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Enviar o corte #7 ao YouTube');
    expect(html).toContain('canal de destino: Canal (@canal)');
    expect(html).toContain('Título no YouTube');
    expect(html).toContain('type="datetime-local"');
    expect(html).toMatch(/data-variant="primario"[^>]*>(?:(?!<\/button>).)*Enviar ao YouTube agora/);
  });

  it('fechado, o diálogo não desenha nada', () => {
    const html = renderToStaticMarkup(
      <InformarLinkDialog corte={null} link="" setLink={vi.fn()} aoFechar={vi.fn()} aoConfirmar={vi.fn()} />,
    );
    expect(html).not.toContain('role="dialog"');
  });

  it('informar o link: um campo de link, sem corretor, e o confirmar', () => {
    const html = renderToStaticMarkup(
      <InformarLinkDialog corte={s} link="" setLink={vi.fn()} aoFechar={vi.fn()} aoConfirmar={vi.fn()} />,
    );
    expect(html).toContain('Informar o link do corte #7');
    expect(html).toMatch(/<input[^>]*type="url"[^>]*spellcheck="false"/i);
    expect(html).toContain('Confirmar publicação');
  });

  it('liberar: com um destino, mostra qual; com dois, o operador escolhe num grupo de rádio', () => {
    const um = renderToStaticMarkup(
      <LiberarPublicacaoDialog corte={s} destino={null} setDestino={vi.fn()} aoFechar={vi.fn()} aoLiberar={vi.fn()} />,
    );
    expect(um).toContain('Liberar a publicação do corte #7');
    expect(um).not.toContain('role="radiogroup"');
    const dois = renderToStaticMarkup(
      <LiberarPublicacaoDialog
        corte={{ ...s, tiktok_publicado_em: '2026-10-01T10:00:00' }}
        destino={null}
        setDestino={vi.fn()}
        aoFechar={vi.fn()}
        aoLiberar={vi.fn()}
      />,
    );
    expect(dois).toContain('role="radiogroup"');
    expect(dois.match(/role="radio"/g)).toHaveLength(2);
  });
});
