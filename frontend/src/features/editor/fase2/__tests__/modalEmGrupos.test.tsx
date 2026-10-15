import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TAMANHO_MAXIMO, TAMANHO_MINIMO, numeroConfirmado } from '@/features/channels/ControlesDoPalco';
import { rascunhoDe, type RascunhoDoPalco } from '@/features/channels/PalcoComponentesSection';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { edicaoDoRascunho } from '../ComponentesArrastaveis';
import { MenuDoModal, gruposDoModal } from '../MenuDoModal';
import { AbaixoDaPrevia, PainelDoPalco } from '../PaineisDoPalco';
import { tamanhoQueCabe } from '../PreviaQueCabe';
import { redimensionarNoPalco } from '../SlotPreviewPartes';

// D-927: o modal de posição em grupos, com a prévia parada, e o palco
// mexido com o mouse (mover e redimensionar) e com tamanho até 500%.

function palco(): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'limpo',
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora'],
    cabecalho: {
      ativo: true,
      nome: '',
      handle: '',
      imagem: '',
      nome_efetivo: 'Seu Canal',
      handle_efetivo: '@seucanal',
      imagem_url: '',
      escala: 1,
      posicao: { automatica: false, x: 64, y: 64 },
      posicao_short: { automatica: true, x: 0, y: 0 },
      mostrar_imagem: true,
      mostrar_nome: true,
      mostrar_handle: true,
    },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco', 'eco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno', 'sombra'],
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } },
    tipos_de_cena: [{ id: 'definicao_termo', nome: 'Definição' }],
  };
}

function modal(rascunho: RascunhoDoPalco) {
  return {
    efetivo: palco(),
    rascunho,
    estilo: rascunho.estilo,
    mudar: () => undefined,
  } as unknown as ReturnType<typeof usePalcoDoModal>;
}

describe('a prévia fica inteira e parada (D-927)', () => {
  it('ocupa o maior 16:9 que cabe na largura e na altura', () => {
    expect(tamanhoQueCabe(1000, 900)).toEqual({ w: 1000, h: 562 });
    expect(tamanhoQueCabe(1000, 360)).toEqual({ w: 640, h: 360 });
    expect(tamanhoQueCabe(1000, 404, 44)).toEqual({ w: 640, h: 360 });
  });
});

describe('o menu de grupos (D-927)', () => {
  it('o cabeçalho só existe no estilo limpo', () => {
    expect(gruposDoModal('limpo')).toContain('cabecalho');
    expect(gruposDoModal('atual')).not.toContain('cabecalho');
  });

  it('o grupo aberto fica marcado', () => {
    const html = renderToStaticMarkup(<MenuDoModal grupos={gruposDoModal('limpo')} ativo="cards" onEscolher={() => undefined} />);
    expect(html).toMatch(/aria-current="page"[^>]*>.*Cards/);
  });

  it('os tipos de card vão para baixo da prévia; os ajustes ficam na coluna', () => {
    const p = modal(rascunhoDe(palco()));
    const coluna = renderToStaticMarkup(
      <MemoryRouter>
        <PainelDoPalco grupo="cards" palco={p} global={false} editavel fundo="hud-forte" placa={{ nome: '', papel: '' }} onFundo={() => undefined} onPlaca={() => undefined} />
      </MemoryRouter>,
    );
    expect(coluna).toContain('No espaço dos cards');
    expect(coluna).not.toContain('Definição');
    expect(renderToStaticMarkup(<AbaixoDaPrevia grupo="cards" palco={p} global={false} />)).toContain('Definição');
    expect(renderToStaticMarkup(<AbaixoDaPrevia grupo="placa" palco={p} global={false} />)).toBe('');
  });
});

describe('mexer no palco com o mouse (D-927)', () => {
  it('a tela cresce mantendo a proporção; a zona dos cards cresce livre', () => {
    const tela = { x: 100, y: 100, w: 800, h: 450 };
    expect(redimensionarNoPalco('slot_tela', tela, 1000, 200)).toEqual({ x: 100, y: 100, w: 1000, h: 563 });
    expect(redimensionarNoPalco('zona_card', tela, 600, 700)).toEqual({ x: 100, y: 100, w: 600, h: 700 });
  });

  it('a tela não passa da borda de baixo ao crescer', () => {
    const tela = { x: 0, y: 600, w: 800, h: 450 };
    expect(redimensionarNoPalco('slot_tela', tela, 1600, 900).y + redimensionarNoPalco('slot_tela', tela, 1600, 900).h).toBeLessThanOrEqual(1080);
  });

  it('arrastar põe o componente na posição manual; a alça muda o tamanho', () => {
    let rascunho: RascunhoDoPalco | null = rascunhoDe(palco());
    const mudar = (f: unknown) => {
      rascunho = typeof f === 'function' ? (f as (r: RascunhoDoPalco | null) => RascunhoDoPalco | null)(rascunho) : (f as RascunhoDoPalco);
    };
    const edicao = edicaoDoRascunho(rascunhoDe(palco()), mudar, null, () => undefined);
    edicao.mover('placa', 300, 700);
    expect(rascunho!.placaPosicao).toEqual({ automatica: false, x: 300, y: 700 });
    edicao.escalar('cabecalho', 3);
    expect(rascunho!.cabecalhoEscala).toBe(3);
  });
});

describe('tamanho até 500% (D-927)', () => {
  it('o campo vai de 25% a 500%', () => {
    expect([TAMANHO_MINIMO, TAMANHO_MAXIMO]).toEqual([25, 500]);
  });

  it('digitar é livre; o limite vale ao confirmar', () => {
    expect(numeroConfirmado('300', TAMANHO_MINIMO, TAMANHO_MAXIMO)).toBe(300);
    expect(numeroConfirmado('900', TAMANHO_MINIMO, TAMANHO_MAXIMO)).toBe(500);
    expect(numeroConfirmado('3', TAMANHO_MINIMO, TAMANHO_MAXIMO)).toBe(25);
    expect(numeroConfirmado('', TAMANHO_MINIMO, TAMANHO_MAXIMO)).toBeNull();
    expect(numeroConfirmado(null, TAMANHO_MINIMO, TAMANHO_MAXIMO)).toBeNull();
  });
});
