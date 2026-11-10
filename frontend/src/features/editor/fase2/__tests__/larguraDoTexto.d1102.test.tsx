import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, SharedCardZoneFrame, renderCenaV2 } from '@video-renderer/public-api';
import { AjustesDosCards, cardsEditaveisDe, type CardsEditaveis } from '@/features/channels/CardsDoCanal';
import { rascunhoDe } from '@/features/channels/PalcoComponentesSection';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';
import { cardsMudaram } from '../mudancasDoPreset';
import { PainelDoPalco } from '../PaineisDoPalco';

// D-1102: até onde vai o texto do card é configurável (a folha de 440 px dentro de
// uma moldura de 1299 px fazia a letra encolher), e o painel não rola de lado.

const CENA = {
  tipo: 'citacao_autor',
  inicio: 0,
  fim: 5,
  texto: 'O homem está condenado a ser livre.',
  autor: 'Sartre',
  layout_card: 'vertical',
  layout_youtube_modo: 'compartilhada',
  layout_card_zone: { x: 40, y: 40, w: 1299, h: 222 },
} as unknown as CenaRemotion;

function desenhar(largura_do_texto?: number) {
  const cards = { ...COMPONENTES_PADRAO.cards, ...(largura_do_texto === undefined ? {} : { largura_do_texto }) };
  const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo', cards });
  function Previa() {
    return (
      <EstiloDasCenasProvider valor={estiloCenas}>
        <FrameOffsetContext.Provider value={0}>
          <SharedCardZoneFrame cena={CENA}>{renderCenaV2(CENA)}</SharedCardZoneFrame>
        </FrameOffsetContext.Provider>
      </EstiloDasCenasProvider>
    );
  }
  return renderToStaticMarkup(
    <Thumbnail component={Previa} compositionWidth={1920} compositionHeight={1080} frameToDisplay={45} durationInFrames={150} fps={30} />,
  );
}

const cards = (largura_do_texto = 0): CardsEditaveis => ({
  ocultos: [],
  escala: 1,
  posicao: { automatica: true, x: 96, y: 112 },
  ajuste: 'preencher',
  alinhamento_vertical: 'centro',
  alinhamento_horizontal: 'centro',
  largura_do_texto,
});

describe('largura do texto do card (D-1102)', () => {
  it('o estilo das cenas leva a largura ao renderer (0 = automática)', () => {
    expect(estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo' })).toMatchObject({ largura_do_texto: 0 });
    const largo = { ...COMPONENTES_PADRAO, estilo: 'limpo' as const, cards: { ...COMPONENTES_PADRAO.cards, largura_do_texto: 1100 } };
    expect(estiloDasCenasDe(largo)).toMatchObject({ largura_do_texto: 1100 });
  });

  it('na zona, sem pedido o texto fica na coluna de 440; com pedido, na largura escolhida', () => {
    expect(desenhar()).toContain('width:440px');
    const largo = desenhar(1100);
    expect(largo).toContain('width:1100px');
    expect(largo).not.toContain('width:440px');
  });

  it('a tela mostra o campo, com o valor, e a edição o devolve', () => {
    const html = renderToStaticMarkup(<AjustesDosCards valor={cards(1100)} onMudar={() => undefined} />);
    expect(html).toContain('palco-cards-largura-texto');
    expect(html).toContain('Largura do texto');
    expect(html).toContain('value="1100"');
  });

  it('o servidor sem a chave vira automática; o que chegou, chega', () => {
    expect(cardsEditaveisDe({ ...COMPONENTES_PADRAO.cards }).largura_do_texto).toBe(0);
    expect(cardsEditaveisDe({ ...COMPONENTES_PADRAO.cards, largura_do_texto: 900 }).largura_do_texto).toBe(900);
  });

  it('mudar só a largura conta como mudança em relação ao preset', () => {
    const igual = { ...COMPONENTES_PADRAO.cards, largura_do_texto: 0 };
    const mexido = { ...COMPONENTES_PADRAO.cards, largura_do_texto: 1100 };
    expect(cardsMudaram(igual, igual)).toBe(false);
    expect(cardsMudaram({ ...igual, largura_do_texto: undefined }, igual)).toBe(false); // preset antigo
    expect(cardsMudaram(igual, mexido)).toBe(true);
  });
});

describe('painel de Cards do modal sem rolagem lateral (D-1102)', () => {
  function painel() {
    const efetivo = {
      canal_id: 'default',
      estilo: 'limpo',
      estilos: ['atual', 'limpo'],
      fundo: 'reticula-aurora',
      fundos: ['reticula-aurora'],
      cabecalho: { ativo: true, nome: '', handle: '', imagem: '', nome_efetivo: 'Seu Canal', handle_efetivo: '@c', imagem_url: '', escala: 1, posicao: { automatica: true, x: 0, y: 0 }, posicao_short: { automatica: true, x: 0, y: 0 }, mostrar_imagem: true, mostrar_nome: true, mostrar_handle: true },
      placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
      contorno_short: 32,
      fundo_short: 'palco',
      fundos_do_short: ['palco'],
      estilo_da_legenda: 'contorno',
      estilos_da_legenda: ['contorno'],
      cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 }, zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 } },
      tipos_de_cena: [{ id: 'citacao_autor', nome: 'Citação' }],
    } as unknown as PalcoComponentes;
    const modal = { efetivo, rascunho: rascunhoDe(efetivo), estilo: 'limpo', mudar: () => undefined } as unknown as ReturnType<typeof usePalcoDoModal>;
    return renderToStaticMarkup(
      <MemoryRouter>
        <PainelDoPalco grupo="cards" palco={modal} global={false} editavel fundo="hud-forte" placa={{ nome: '', papel: '' }} onFundo={() => undefined} onPlaca={() => undefined} />
      </MemoryRouter>,
    );
  }

  it('os campos de tamanho e de caixa empilham numa coluna só (300 px não comporta duas)', () => {
    const html = painel();
    expect(html).toContain('palco-cards-caixa-w');
    expect(html).not.toContain('sm:grid-cols-2 sm:grid-cols-2');
    expect(html.match(/sm:grid-cols-2/g)?.length ?? 0).toBeLessThanOrEqual(1); // só o dos alinhamentos
  });

  it('o botão "Sem caixa" pode quebrar linha em vez de empurrar o painel', () => {
    // `.ap .btn` fixa nowrap e 30 px de altura (upgrade.css); só o importante vence.
    expect(painel()).toMatch(/<button[^>]*!whitespace-normal[^>]*>Sem caixa/);
  });
});
