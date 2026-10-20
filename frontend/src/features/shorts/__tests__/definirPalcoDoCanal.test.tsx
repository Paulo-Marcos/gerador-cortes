import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PalcoComponentes } from '@/features/channels/api/canais';
import { componentesDoRascunho } from '@/features/channels/EdicaoDoPalco';
import * as modais from '@/features/channels/PadraoDoCanalModais';
import { rascunhoDe } from '@/features/channels/PalcoComponentesSection';
import { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { DefinirPalcoDoCanalModal, planoDeExemplo, RodapeDoCanal } from '../DefinirPalcoDoCanal';

// D-946: o padrão do short do canal se edita no modal do palco do short, no
// modo canal (sem corte), e grava no palco do canal — o modal leve saiu.

vi.mock('@/features/channels/usePalcoDoModal', () => ({ usePalcoDoModal: vi.fn() }));

type Palco = ReturnType<typeof usePalcoDoModal>;

function efetivo(estilo: 'atual' | 'limpo'): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo,
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora', 'chapado'],
    cabecalho: {
      ativo: true,
      nome: '',
      handle: '',
      imagem: '',
      nome_efetivo: 'Seu Canal',
      handle_efetivo: '@seucanal',
      imagem_url: '',
      mostrar_imagem: true,
      mostrar_nome: true,
      mostrar_handle: true,
      escala: 1,
      posicao: { automatica: true, x: 0, y: 0 },
      posicao_short: { automatica: true, x: 0, y: 0 },
    },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco', 'eco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno', 'sombra'],
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } },
    tipos_de_cena: [],
  };
}

function palcoFalso(estilo: 'atual' | 'limpo', extra: Partial<Palco> = {}): Palco {
  const palco = efetivo(estilo);
  const rascunho = rascunhoDe(palco);
  return {
    efetivo: palco,
    rascunho,
    origem: 'canal',
    estilo,
    componentes: componentesDoRascunho(palco, rascunho),
    mudar: vi.fn(),
    setEstilo: vi.fn(),
    aplicar: vi.fn(),
    herdar: vi.fn(),
    salvando: false,
    mudou: true,
    ...extra,
  } as unknown as Palco;
}

function desenhar(estilo: 'atual' | 'limpo') {
  vi.mocked(usePalcoDoModal).mockReturnValue(palcoFalso(estilo));
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DefinirPalcoDoCanalModal onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

/** Os botões de um elemento já montado por uma função sem hooks. */
function botoes(elemento: ReactElement): ReactElement<{ onClick: () => void; disabled?: boolean; children: ReactNode }>[] {
  return (elemento.props as { children: ReactElement[] }).children as never;
}

beforeEach(() => vi.mocked(usePalcoDoModal).mockReset());

describe('o botão do short na tela de Canais (D-946)', () => {
  it('abre o modal do palco do short no modo canal; o horizontal segue no de posição', () => {
    const fechar = () => undefined;
    expect(modais.PadraoDoCanal({ tipo: 'short', onClose: fechar }).type).toBe(DefinirPalcoDoCanalModal);
    expect(modais.PadraoDoCanal({ tipo: 'horizontal', onClose: fechar }).type).toBe(modais.PadraoDoHorizontalNoCanal);
  });

  it('o modal leve do short saiu', () => {
    expect('PadraoDoShortNoCanal' in modais).toBe(false);
  });
});

describe('o modal do palco do short no modo canal (D-946)', () => {
  it('edita o palco do canal, sem corte nem projeto', () => {
    desenhar('limpo');
    expect(usePalcoDoModal).toHaveBeenCalledWith({ tipo: 'short', projetoId: undefined, alvo: 'canal', aberto: true });
  });

  it('é o modal completo: a faixa do estilo do canal, o palco e a prévia de exemplo', () => {
    const html = desenhar('limpo');
    expect(html).toContain('Definir o palco do short do canal');
    expect(html).toContain('Usar neste canal');
    expect(html).toContain('o palco global do canal');
    expect(html).toContain('como vai sair');
    expect(html).toContain('a tela compartilhada');
    expect(html).toContain('a pessoa');
  });

  it('não mostra o que é de cada short (arranjo, recortes, moldura, legenda, preset)', () => {
    const html = desenhar('limpo');
    for (const secao of ['Como a tela monta', 'De onde vem cada janela', 'A moldura', 'A legenda', 'Guardar como preset']) {
      expect(html).not.toContain(secao);
    }
  });

  it('mostra só o estilo ativo (D-960)', () => {
    const limpo = desenhar('limpo');
    expect(limpo).toContain('Palco do short · estilo Limpo');
    expect(limpo).not.toContain('estilo Atual');
    const atual = desenhar('atual');
    expect(atual).toContain('Palco do short · estilo Atual');
    expect(atual).not.toContain('estilo Limpo');
  });
});

describe('salvar no modo canal (D-946)', () => {
  it('Aplicar grava no palco do canal e fecha ao terminar', () => {
    const palco = palcoFalso('limpo');
    const fechar = vi.fn();
    const [, aplicar] = botoes(RodapeDoCanal({ palco, onClose: fechar }));
    aplicar.props.onClick();
    expect(palco.aplicar).toHaveBeenCalledWith(fechar);
  });

  it('Cancelar fecha sem gravar; sem mudança não há o que aplicar', () => {
    const palco = palcoFalso('limpo', { mudou: false });
    const fechar = vi.fn();
    const [cancelar, aplicar] = botoes(RodapeDoCanal({ palco, onClose: fechar }));
    expect(aplicar.props.disabled).toBe(true);
    cancelar.props.onClick();
    expect(fechar).toHaveBeenCalledOnce();
    expect(palco.aplicar).not.toHaveBeenCalled();
  });
});

describe('a prévia sem corte (D-946)', () => {
  it('desenha um short de exemplo com a tela em cima e a pessoa embaixo, sobrando a faixa do cabeçalho', () => {
    const plano = planoDeExemplo();
    expect(plano.canvas).toEqual({ largura: 1080, altura: 1920 });
    expect(plano.moldura).toBe('palco');
    expect(plano.recortes.map((r) => r.regiao)).toEqual(['tela', 'pessoa']);
    expect(plano.slots.tela.y).toBeGreaterThan(0);
  });
});
