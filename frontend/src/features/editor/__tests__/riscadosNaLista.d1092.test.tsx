import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { acharCorteVizinho, proximoDepoisDeRiscar, separarRiscados } from '../riscarCorte';
import { FRASE_DO_RISCADO, nomearMotivo, SecaoDosRiscados, TRAZER_DE_VOLTA } from '../RiscadosDaLista';

// D-1092 (E2 do design da etapa Cortes, P1 a P5): o corte riscado sai da lista
// "Cortes da live" e do J/K, e fica na seção "Riscados · N" no fim da lista, com
// o motivo, a frase do que ficou e o "Trazer de volta (regera o bruto)".

const navegar = vi.fn();
let publicado: Chrome | null = null;
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navegar,
}));
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

const corteDe = (id: string, numero: number, extra: Partial<Corte> = {}) =>
  ({ id, numero, titulo_proposto: `Corte ${id}`, status: 'aprovado', motivo_riscado: [], ...extra }) as unknown as Corte;
const riscadoDe = (id: string, numero: number, motivo_riscado: string[] = []) =>
  corteDe(id, numero, { status: 'rejeitado', motivo_riscado });

// a e c vivos; b e d riscados, um no meio e um no fim.
const CORTES = [corteDe('a', 1), riscadoDe('b', 2, ['repetido']), corteDe('c', 3), riscadoDe('d', 4)];

function publicar(aberto: Corte, cortes = CORTES): Chrome {
  publicado = null;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={cortes}
          corte={aberto}
          exportStatus={[]}
          caminhoDoCorte={(c) => `/corte/${c.id}`}
          sub=""
          fire={false}
          sujo={false}
          salvando={false}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={vi.fn()}
          riscar={{ onRiscar: vi.fn() }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return publicado!;
}

beforeEach(() => navegar.mockClear());

describe('a lista do editor pula os riscados', () => {
  it('"Cortes da live" mostra só os vivos e conta só eles', () => {
    const { lista } = publicar(CORTES[0]);
    expect(lista!.itens.map((item) => item.id)).toEqual(['a', 'c']);
    expect(lista!.resumo).toBe('2 · 0 prontos');
    expect(lista!.cabecalho!.sub).toBe('2 cortes · 0 prontos');
  });

  it('os riscados vão para o rodapé da lista, na ordem', () => {
    const rodape = publicar(CORTES[0]).lista!.rodape as ReactElement<{ projetoId: string; riscados: Corte[] }>;
    expect(isValidElement(rodape)).toBe(true);
    expect(rodape.props.projetoId).toBe('p1');
    expect(rodape.props.riscados.map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('J e K pulam os riscados, nos dois sentidos e em volta', () => {
    const { atual } = publicar(CORTES[0]);
    atual!.onProximo!();
    expect(navegar).toHaveBeenLastCalledWith('/corte/c');
    atual!.onAnterior!();
    expect(navegar).toHaveBeenLastCalledWith('/corte/c');

    publicar(CORTES[2]).atual!.onProximo!();
    expect(navegar).toHaveBeenLastCalledWith('/corte/a');
  });

  it('aberto num riscado, J e K levam aos vivos vizinhos', () => {
    const { atual } = publicar(CORTES[1]);
    atual!.onProximo!();
    expect(navegar).toHaveBeenLastCalledWith('/corte/c');
    atual!.onAnterior!();
    expect(navegar).toHaveBeenLastCalledWith('/corte/a');
  });
});

describe('acharCorteVizinho', () => {
  it('segue a ordem pulando os riscados', () => {
    expect(acharCorteVizinho(CORTES, 'a', 1)?.id).toBe('c');
    expect(acharCorteVizinho(CORTES, 'c', 1)?.id).toBe('a');
    expect(acharCorteVizinho(CORTES, 'c', -1)?.id).toBe('a');
    expect(acharCorteVizinho(CORTES, 'd', -1)?.id).toBe('c');
    expect(acharCorteVizinho(CORTES, 'd', 1)?.id).toBe('a');
  });

  it('sem outro vivo, não há para onde ir', () => {
    expect(acharCorteVizinho([corteDe('a', 1), riscadoDe('b', 2)], 'a', 1)).toBeNull();
    expect(acharCorteVizinho([riscadoDe('b', 2)], 'b', -1)).toBeNull();
    expect(acharCorteVizinho([], 'x', 1)).toBeNull();
  });

  it('corte fora da lista começa da ponta do sentido', () => {
    expect(acharCorteVizinho(CORTES, 'x', 1)?.id).toBe('a');
    expect(acharCorteVizinho(CORTES, 'x', -1)?.id).toBe('c');
  });

  it('o R segue pelo mesmo caminho', () => {
    expect(proximoDepoisDeRiscar(CORTES, 'a')?.id).toBe('c');
    expect(separarRiscados(CORTES).riscados.map((c) => c.id)).toEqual(['b', 'd']);
  });
});

/** Acha, na árvore de elementos, o primeiro <button>. */
function acharBotao(no: ReactNode): ReactElement<{ onClick: () => void; disabled?: boolean }> | null {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = acharBotao(filho);
      if (achado) return achado;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(no)) return null;
  if (no.type === 'button') return no as ReactElement<{ onClick: () => void; disabled?: boolean }>;
  return acharBotao(no.props.children);
}

describe('a seção "Riscados · N"', () => {
  const desenhar = (props: Partial<Parameters<typeof SecaoDosRiscados>[0]> = {}) =>
    renderToStaticMarkup(
      <SecaoDosRiscados riscados={[CORTES[1], CORTES[3]]} onTrazerDeVolta={vi.fn()} {...props} />,
    );

  it('mostra quantos, o número e o título riscados, a frase e o botão', () => {
    const html = desenhar();
    expect(html).toContain('Riscados · 2</summary>');
    expect(html).toMatch(/line-through[^>]*>#2</);
    expect(html).toMatch(/line-through[^>]*>Corte b</);
    expect(html.split(FRASE_DO_RISCADO)).toHaveLength(3);
    expect(html.split(TRAZER_DE_VOLTA)).toHaveLength(3);
    expect(TRAZER_DE_VOLTA).toBe('Trazer de volta (regera o bruto)');
    expect(FRASE_DO_RISCADO).toBe('Proposta e trabalho guardados; a mídia saiu.');
  });

  it('o chip do motivo aparece só quando há motivo', () => {
    const html = desenhar({ riscados: [riscadoDe('b', 2, ['repetido', 'curto_demais'])] });
    expect(html).toContain('>Repete outro corte</span>');
    expect(html).toContain('>Curto demais</span>');
    expect(desenhar({ riscados: [riscadoDe('d', 4)] })).not.toContain('class="chip"');
  });

  it('sem riscados, a seção não existe', () => {
    expect(desenhar({ riscados: [] })).toBe('');
  });

  it('o botão traz de volta aquele corte, e fica ocupado enquanto um volta', () => {
    const onTrazerDeVolta = vi.fn();
    const botao = acharBotao(SecaoDosRiscados({ riscados: [CORTES[1]], onTrazerDeVolta }));
    botao!.props.onClick();
    expect(onTrazerDeVolta).toHaveBeenCalledWith(CORTES[1]);
    expect(botao!.props.disabled).toBe(false);

    const ocupado = acharBotao(SecaoDosRiscados({ riscados: [CORTES[1]], onTrazerDeVolta, trazendo: 'b' }));
    expect(ocupado!.props.disabled).toBe(true);
  });

  it('o rótulo do motivo vem do canal, depois do padrão, depois do slug', () => {
    const doCanal = [{ slug: 'repetido', rotulo: 'Já tem esse' }, { slug: 'meu', rotulo: 'Motivo meu' }];
    expect(nomearMotivo('repetido', doCanal)).toBe('Já tem esse');
    expect(nomearMotivo('meu', doCanal)).toBe('Motivo meu');
    expect(nomearMotivo('tema_fraco')).toBe('Tema não rende');
    expect(nomearMotivo('sumiu')).toBe('sumiu');
  });
});
