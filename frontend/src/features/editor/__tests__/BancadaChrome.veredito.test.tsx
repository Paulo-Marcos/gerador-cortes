import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-864: num corte `processado`, o principal dizia "Aprovar corte" — o rótulo
// só olhava `aprovado` —, mas o clique (ou o Enter) chamava o toggle, que
// trata `processado` como aprovado e DEVOLVIA o corte a proposto. O rótulo
// tem de seguir a mesma regra do toggle.
let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

function publicar(status: Corte['status'], onAprovar = vi.fn(), salvo = { sujo: false, salvando: false }) {
  // Zerado a cada caso: sem isto, um caso sem barra publicada leria a do anterior.
  publicado = null;
  const corte = { id: 'c1', numero: 1, titulo_proposto: 'Corte', status } as unknown as Corte;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={[corte]}
          corte={corte}
          exportStatus={[]}
          caminhoDoCorte={() => '/'}
          sub=""
          fire={false}
          sujo={salvo.sujo}
          salvando={salvo.salvando}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={onAprovar}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // o render reatribui `publicado` pelo mock; o tsc não enxerga isso
  return publicado as Chrome | null;
}
const barra = (status: Corte['status'], onAprovar = vi.fn()) => publicar(status, onAprovar)?.barra;
const principal = (status: Corte['status'], onAprovar = vi.fn()) => barra(status, onAprovar)?.primario;

describe('BancadaChrome — rótulo do veredito', () => {
  it.each([
    ['proposto', 'Aprovar corte'],
    ['aprovado', 'Aprovado'],
    ['processado', 'Aprovado'],
  ] as const)('status %s: o principal diz "%s"', (status, rotulo) => {
    expect(principal(status)?.texto).toBe(rotulo);
  });

  it('o principal (clique e Enter) chama o veredito da tela', () => {
    const onAprovar = vi.fn();
    principal('processado', onAprovar)?.onClick?.();
    expect(onAprovar).toHaveBeenCalledTimes(1);
  });
});

// D-886: a nota da IA e o porquê do corte moram na barra das telas de um corte.
describe('BancadaChrome — nota e porquê da IA', () => {
  it('a barra leva o selo da nota com o corte da tela e lembra a tecla W', async () => {
    const { PorQueNaBancada } = await import('@/features/porque-do-corte/PorQueNaBancada');
    const publicada = barra('proposto');
    const extra = publicada?.extra as { type: unknown; props: { corte: Corte } };
    expect(extra.type).toBe(PorQueNaBancada);
    expect(extra.props.corte).toMatchObject({ id: 'c1', numero: 1 });
    expect(publicada?.teclas).toEqual([
      { teclas: ['Space'], texto: 'tocar' },
      { teclas: ['W'], texto: 'por quê' },
    ]);
  });
});

// O chip de estado saiu para `estadoDoSalvar` (D-886, teto de função): os três
// estados continuam os mesmos.
describe('BancadaChrome — chip de estado do salvar', () => {
  it.each([
    [{ sujo: false, salvando: true }, { texto: 'salvando…', icone: 'loader', cor: 'var(--info)', bg: 'var(--info-soft)' }],
    [{ sujo: true, salvando: true }, { texto: 'salvando…', icone: 'loader', cor: 'var(--info)', bg: 'var(--info-soft)' }],
    [{ sujo: true, salvando: false }, { texto: 'não salvo', icone: 'triangle-alert', cor: 'var(--warn)', bg: 'var(--warn-soft)' }],
    [{ sujo: false, salvando: false }, { texto: 'salvo', icone: 'circle-check', cor: 'var(--ok)', bg: 'var(--ok-soft)' }],
  ])('%o → %o', (salvo, estado) => {
    expect(publicar('proposto', vi.fn(), salvo)?.estado).toEqual(estado);
  });
});
