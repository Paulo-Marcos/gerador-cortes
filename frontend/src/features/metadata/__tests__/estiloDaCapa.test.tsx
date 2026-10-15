import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ComponentesDaCapa, EscolhaDoEstilo } from '../ControlesDaCapa';
import { EstilizarCapa } from '../EstiloDaCapaModal';
import {
  blocosVisiveis,
  comPosicao,
  comVisibilidade,
  podeAparecer,
  propsDaPrevia,
  rascunhoDoSalvo,
  type PainelDaCapa,
} from '../estiloDaCapa';

// D-933: o modal "Estilizar capa" — o rascunho parcial, a prévia com os props
// do renderer e os controles de estilo e visibilidade.

const faixa = (y: number) => ({ x: 50, y, w: 980, h: 100 });

function painel(efetivo: Partial<PainelDaCapa['efetivo']> = {}): PainelDaCapa {
  return {
    salvo: { estilo: null, fundo: null, visiveis: null, posicoes: null },
    efetivo: {
      estilo: 'atual',
      fundo: 'reticula-aurora',
      visiveis: { etiqueta: true, arte: true, selo: true, cabecalho: false, acento: false },
      faixas: {
        etiqueta: faixa(288),
        arte: faixa(512),
        selo: faixa(1560),
        cabecalho: faixa(176),
        acento: faixa(480),
      },
      ...efetivo,
    },
    padrao: {},
    estilo_do_palco: 'atual',
    fundo_do_atual: 'hud-forte',
    arte: 'data:image/png;base64,AAA',
    cabecalho: { nome: 'Canal', handle: '@canal', imagem: '' },
    estilos: ['palco', 'atual', 'limpo'],
    fundos: ['reticula-aurora', 'linho'],
    componentes: ['etiqueta', 'arte', 'selo', 'cabecalho', 'acento'],
    componentes_do_limpo: ['cabecalho', 'acento'],
    quadro: { largura: 1080, altura: 1920 },
    faixa_segura: { y: 288, h: 1344 },
    lado_minimo: 40,
  };
}

describe('rascunho do estilo da capa', () => {
  it('nasce do salvo sem as chaves nulas: o contrato é parcial', () => {
    expect(rascunhoDoSalvo(painel().salvo)).toEqual({});
    expect(
      rascunhoDoSalvo({ estilo: 'limpo', fundo: null, visiveis: { selo: false }, posicoes: null }),
    ).toEqual({ estilo: 'limpo', visiveis: { selo: false } });
  });

  it('esconder um componente não mexe nos outros', () => {
    const r = comVisibilidade({ visiveis: { acento: true } }, 'selo', false);
    expect(r.visiveis).toEqual({ acento: true, selo: false });
  });

  it('o arraste grava a posição em pixel inteiro', () => {
    const r = comPosicao({}, 'etiqueta', { x: 10.4, y: 200.6, w: 980, h: 199.5 });
    expect(r.posicoes?.etiqueta).toEqual({ x: 10, y: 201, w: 980, h: 200 });
  });

  it('cabeçalho e acento só aparecem no estilo limpo', () => {
    expect(podeAparecer('cabecalho', 'atual')).toBe(false);
    expect(podeAparecer('acento', 'limpo')).toBe(true);
    expect(podeAparecer('selo', 'atual')).toBe(true);
  });

  it('só se arrasta o que está na capa', () => {
    expect(Object.keys(blocosVisiveis(painel()))).toEqual(['etiqueta', 'arte', 'selo']);
  });
});

describe('prévia da capa', () => {
  it('monta os props do renderer: arte vira frame e o texto em caixa alta', () => {
    const props = propsDaPrevia(painel(), 'o juro composto', 'data:image/png;base64,AAA');
    expect(props.faixas.frame).toEqual(faixa(512));
    expect(props.etiqueta).toBe('O JURO COMPOSTO');
    expect(props.estilo).toBe('atual');
    expect(props.cabecalho).toBeUndefined();
    expect(props.frameDataUri).toBe('data:image/png;base64,AAA');
  });

  it('com o cabeçalho ligado no limpo, ele segue para a composição', () => {
    const visiveis = { etiqueta: true, arte: true, selo: true, cabecalho: true, acento: false };
    const props = propsDaPrevia(painel({ estilo: 'limpo', visiveis }), 'x', '');
    expect(props.estilo).toBe('limpo');
    expect(props.cabecalho?.nome).toBe('Canal');
  });
});

describe('controles do modal', () => {
  it('no estilo atual, cabeçalho e acento ficam desligados e avisam por quê', () => {
    const html = renderToStaticMarkup(
      <ComponentesDaCapa painel={painel()} rascunho={{}} onMudar={vi.fn()} />,
    );
    expect(html).toContain('Cabeçalho do canal');
    expect(html.match(/\(só no limpo\)/g)).toHaveLength(2);
  });

  it('o fundo só se escolhe quando a capa sai no limpo', () => {
    const atual = renderToStaticMarkup(
      <EscolhaDoEstilo painel={painel()} rascunho={{}} onMudar={vi.fn()} />,
    );
    const limpo = renderToStaticMarkup(
      <EscolhaDoEstilo painel={painel({ estilo: 'limpo' })} rascunho={{}} onMudar={vi.fn()} />,
    );
    expect(atual).not.toContain('Fundo da capa');
    expect(limpo).toContain('Fundo da capa');
  });

  it('sem estilo salvo, a escolha marcada é seguir o palco', () => {
    const html = renderToStaticMarkup(
      <EscolhaDoEstilo painel={painel()} rascunho={{}} onMudar={vi.fn()} />,
    );
    expect(html).toContain('checked="" value="palco"');
    expect(html).toContain('Seguir o palco');
  });

  it('o slot ganha o botão Estilizar capa, sem pedir o painel enquanto fechado', () => {
    const cliente = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente}>
        <EstilizarCapa
          ocupado={false}
          corteId="c1"
          etiqueta="x"
          refazCapa={false}
          onSalvou={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('Estilizar capa');
    expect(cliente.getQueryCache().getAll()).toHaveLength(0);
  });
});
