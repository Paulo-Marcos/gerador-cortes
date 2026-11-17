import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Anel } from '../anel';
import {
  aoClicarNoCorte,
  destinoDaTecla,
  MapaDaLive,
  rotuloDoCorte,
  type CorteDoMapa,
} from '../mapa-da-live';
import { Progresso } from '../progresso';
import { ReguaDeDias, rotuloDoDia, type DiaDaRegua } from '../regua-de-dias';

// D-1121 (E-069 H-11a): os componentes de tempo. O teste de tela afirma COMPORTAMENTO
// (o que se lê, o que se opera, quantos no feixe); classe de cor só onde ela É o contrato.

const DURACAO = 9660;
const CORTES: CorteDoMapa[] = [
  {
    id: 'c1',
    numero: 1,
    nome: 'Por que parei de planejar',
    inicioSeg: 1674,
    fimSeg: 2671,
    estado: 'pronto',
  },
  {
    id: 'c2',
    numero: 2,
    nome: 'O erro dos três meses',
    inicioSeg: 3206,
    fimSeg: 4298,
    estado: 'pronto',
  },
  {
    id: 'c3',
    numero: 3,
    nome: 'Quando vale contratar',
    inicioSeg: 4873,
    fimSeg: 5742,
    estado: 'proposto',
  },
  {
    id: 'c4',
    numero: 4,
    nome: 'Pergunta do chat',
    inicioSeg: 5760,
    fimSeg: 6000,
    estado: 'proposto',
  },
  {
    id: 'c5',
    numero: 5,
    nome: 'Aparte sobre café',
    inicioSeg: 6018,
    fimSeg: 6887,
    estado: 'riscado',
  },
  { id: 'c6', numero: 6, nome: 'Fecho da live', inicioSeg: 7728, fimSeg: 8501, estado: 'pronto' },
];

const mapa = (props: Partial<React.ComponentProps<typeof MapaDaLive>> = {}) =>
  renderToStaticMarkup(<MapaDaLive duracaoSeg={DURACAO} cortes={CORTES} {...props} />);

describe('MapaDaLive', () => {
  it('é um <nav> com um <a> por corte, cada um na posição em que nasceu', () => {
    const html = mapa();
    expect(html).toMatch(/^<nav[^>]*aria-label="Mapa da live"/);
    expect(html.match(/<a /g)).toHaveLength(6);
    // Corte 1: 17,33% e 10,32% (os números da DIRECAO §9.3).
    expect(html).toContain('--inicio:17.33%');
    expect(html).toContain('--largura:10.32%');
  });

  it('cada corte tem aria-label com número, nome, intervalo e estado', () => {
    const html = mapa();
    expect(html).toContain(
      'aria-label="Corte 2, O erro dos três meses, de 0:53:26 a 1:11:38, pronto"',
    );
    expect(html).toContain(
      'aria-label="Corte 3, Quando vale contratar, de 1:21:13 a 1:35:42, proposto"',
    );
    expect(html).toContain(
      'aria-label="Corte 5, Aparte sobre café, de 1:40:18 a 1:54:47, riscado"',
    );
  });

  it('o corte aberto diz "aberto" no aria-label e leva aria-current', () => {
    const html = mapa({ abertoId: 'c2' });
    expect(html).toContain(
      'aria-label="Corte 2, O erro dos três meses, de 0:53:26 a 1:11:38, pronto, aberto"',
    );
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(rotuloDoCorte(CORTES[0], true)).toContain(', aberto');
  });

  it('só UM corte leva o feixe: o aberto. Sem corte aberto, nenhum é "atual"', () => {
    expect(mapa().match(/aria-current/g)).toBeNull();
    expect(mapa({ abertoId: 'c4' }).match(/aria-current="true"/g)).toHaveLength(1);
    // Um id que não existe também não acende ninguém.
    expect(mapa({ abertoId: 'fantasma' }).match(/aria-current/g)).toBeNull();
  });

  it('o estado de cada corte vai em data-estado (proposto, pronto, riscado)', () => {
    const html = mapa();
    expect(html.match(/data-estado="pronto"/g)).toHaveLength(3);
    expect(html.match(/data-estado="proposto"/g)).toHaveLength(2);
    expect(html.match(/data-estado="riscado"/g)).toHaveLength(1);
  });

  it('o corte aberto mostra o estado num Selo (o mapa fala em luz, o selo em cor)', () => {
    const html = mapa({ abertoId: 'c3' });
    expect(html).toContain('data-parte="aberto"');
    expect(html).toContain('data-tom="neutro"');
    expect(mapa({ abertoId: 'c1' })).toContain('data-tom="convite"');
    expect(mapa({ abertoId: 'c5' })).toContain('data-tom="inerte"');
    expect(mapa()).not.toContain('data-parte="aberto"');
  });

  it('desenha as marcas de 30 em 30 min e os tempos de 0:00 ao fim', () => {
    const html = mapa();
    expect(html.match(/data-marca=/g)).toHaveLength(5);
    expect(html).toContain('>0:00<');
    expect(html).toContain('>0:30<');
    expect(html).toContain('>2:00<');
    // A marca de 2:30 cai colada no fim (93%): a linha fica, o rótulo sai para não bater em "2:41:00".
    expect(html).not.toContain('>2:30<');
    expect(html).toContain('>2:41:00<');
  });

  it('live sem duração: não inventa posição, e os cortes continuam navegáveis', () => {
    const html = mapa({ duracaoSeg: 0 });
    expect(html).not.toContain('--inicio');
    expect(html).not.toContain('data-marca=');
    expect(html).toContain('data-parte="sem-duracao"');
    expect(html.match(/<a /g)).toHaveLength(6);
  });

  it('corte em 0 e corte no fim cabem na pista', () => {
    const html = mapa({
      cortes: [
        { id: 'a', numero: 1, nome: 'Abertura', inicioSeg: 0, fimSeg: 600, estado: 'pronto' },
        {
          id: 'z',
          numero: 2,
          nome: 'Fim',
          inicioSeg: DURACAO,
          fimSeg: DURACAO,
          estado: 'proposto',
        },
      ],
    });
    expect(html).toContain('--inicio:0%');
    expect(html).toContain('--inicio:100%;--largura:0%');
    // O piso protege o fim: a pílula nunca sai da pista.
    expect(html).toContain('left-[min(var(--inicio),calc(100%-var(--piso)))]');
  });

  it('o tamanho mini troca a altura da pista (50 → 30 px)', () => {
    expect(mapa()).toContain('h-[50px]');
    expect(mapa({ tamanho: 'mini' })).toContain('h-[30px]');
    expect(mapa({ tamanho: 'mini' })).toContain('data-tamanho="mini"');
  });

  it('com onAbrir o clique chama a tela em vez de navegar; sem onAbrir o <a> segue o href', () => {
    const abertos: string[] = [];
    let impedidos = 0;
    aoClicarNoCorte('c3', (id) => abertos.push(id))!({ preventDefault: () => impedidos++ });
    expect(abertos).toEqual(['c3']);
    expect(impedidos).toBe(1);
    expect(aoClicarNoCorte('c3', undefined)).toBeUndefined();
  });
});

describe('destinoDaTecla (teclado do mapa)', () => {
  it('setas andam um corte; Home e End vão às pontas', () => {
    expect(destinoDaTecla('ArrowRight', 1, 6)).toBe(2);
    expect(destinoDaTecla('ArrowLeft', 1, 6)).toBe(0);
    expect(destinoDaTecla('Home', 4, 6)).toBe(0);
    expect(destinoDaTecla('End', 1, 6)).toBe(5);
  });

  it('nas pontas o foco para (não dá a volta)', () => {
    expect(destinoDaTecla('ArrowLeft', 0, 6)).toBe(0);
    expect(destinoDaTecla('ArrowRight', 5, 6)).toBe(5);
  });

  it('outra tecla não é do mapa, e sem cortes não há para onde ir', () => {
    expect(destinoDaTecla('Enter', 1, 6)).toBeNull();
    expect(destinoDaTecla('Tab', 1, 6)).toBeNull();
    expect(destinoDaTecla('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('ReguaDeDias', () => {
  const DIAS: DiaDaRegua[] = [
    { data: '2026-11-07', lives: [] },
    {
      data: '2026-11-08',
      hoje: true,
      lives: [
        {
          id: 'l1',
          titulo: 'Cansei do Youtube',
          href: '/p/l1',
          capa: '/c/l1.jpg',
          tom: 'convite',
          estado: 'Pronto para publicar',
        },
      ],
    },
  ];
  const html = renderToStaticMarkup(<ReguaDeDias dias={DIAS} />);

  it('uma casa por dia; dia sem live é tracejado e dia com live é sólido', () => {
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toMatch(/data-dia="2026-11-07" data-tem-live="nao"[^>]*border-dashed/);
    expect(html).toMatch(/data-dia="2026-11-08" data-tem-live="sim"[^>]*border-solid/);
    expect(html).toContain('Sem live neste dia');
  });

  it('hoje leva aria-current="date" e a palavra "hoje"', () => {
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(html).toContain('hoje');
  });

  it('a live é um link com título, capa decorativa e o estado em palavras', () => {
    expect(html).toContain('href="/p/l1"');
    expect(html).toContain('Cansei do Youtube');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-label="Pronto para publicar"');
  });

  it('rotuloDoDia dá o dia da semana certo, sem depender do ICU', () => {
    expect(rotuloDoDia('2026-11-08')).toEqual({
      dia: '08 nov',
      semana: 'dom',
      completo: 'dom, 08 de nov',
    });
    expect(rotuloDoDia('2026-11-07').semana).toBe('sáb');
    expect(rotuloDoDia('lixo').dia).toBe('lixo');
  });
});

describe('Anel', () => {
  it('é uma imagem com o rótulo completo e o miolo escondido do leitor', () => {
    const h = renderToStaticMarkup(
      <Anel valor={80} rotulo="Nota da IA: 24 de 30" tamanho={34} espessura={3}>
        24
      </Anel>,
    );
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="Nota da IA: 24 de 30"');
    expect(h).toContain('--p:80');
    expect(h).toContain('--d:34px');
    expect(h).toContain('--t:3px');
    expect(h).toContain('aria-hidden="true"');
  });

  it('a cor é uma variante; o padrão é a íris', () => {
    expect(renderToStaticMarkup(<Anel valor={1} rotulo="x" />)).toContain('data-cor="iris"');
    expect(renderToStaticMarkup(<Anel valor={1} rotulo="x" cor="aviso" />)).toContain(
      '[--c:var(--cc-aviso)]',
    );
  });

  it('aparra o valor: 104 vira 100, -3 vira 0, NaN vira 0', () => {
    expect(renderToStaticMarkup(<Anel valor={104} rotulo="x" />)).toContain('--p:100');
    expect(renderToStaticMarkup(<Anel valor={-3} rotulo="x" />)).toContain('--p:0');
    expect(renderToStaticMarkup(<Anel valor={Number.NaN} rotulo="x" />)).toContain('--p:0');
  });

  it('nunca usa o feixe', () => {
    expect(renderToStaticMarkup(<Anel valor={50} rotulo="x" />)).not.toMatch(/feixe/);
  });
});

describe('Progresso', () => {
  it('é um progressbar com valores e rótulo, e o percentual em mono ao lado', () => {
    const h = renderToStaticMarkup(<Progresso valor={64} rotulo="Renderização do corte 3" />);
    expect(h).toContain('role="progressbar"');
    expect(h).toContain('aria-label="Renderização do corte 3"');
    expect(h).toContain('aria-valuemin="0"');
    expect(h).toContain('aria-valuemax="100"');
    expect(h).toContain('aria-valuenow="64"');
    expect(h).toContain('--p:64');
    expect(h).toContain('>64%<');
  });

  it('mostrarValor={false} esconde o percentual', () => {
    expect(
      renderToStaticMarkup(<Progresso valor={64} rotulo="x" mostrarValor={false} />),
    ).not.toContain('%<');
  });

  it('aparra e arredonda: 104,6 vira 100; 33,4 vira 33', () => {
    expect(renderToStaticMarkup(<Progresso valor={104.6} rotulo="x" />)).toContain(
      'aria-valuenow="100"',
    );
    expect(renderToStaticMarkup(<Progresso valor={33.4} rotulo="x" />)).toContain(
      'aria-valuenow="33"',
    );
  });

  it('o enchimento é info e nunca o feixe', () => {
    const h = renderToStaticMarkup(<Progresso valor={10} rotulo="x" />);
    expect(h).toContain('--cc-info');
    expect(h).not.toMatch(/feixe/);
  });
});
