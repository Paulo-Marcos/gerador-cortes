import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RascunhoDoPalco } from '@/features/channels/PalcoComponentesSection';
import { caixaEsticada } from '@/features/editor/fase2/ComponentesArrastaveis';
import { GuiasNaPrevia } from '@/features/editor/fase2/guiasDeAlinhamento';
import {
  CabecalhoArrastavelNoShort,
  edicaoDoCabecalhoNoShort,
  numerarSecoes,
  QUADRO_DO_SHORT,
} from '../SecoesDoEstilo';

// D-937: o modal do palco do short separado por estilo, e o cabeçalho do limpo
// arrastável e redimensionável na prévia vertical.

function rascunho(over: Partial<RascunhoDoPalco> = {}): RascunhoDoPalco {
  return {
    estilo: 'limpo',
    fundo: 'reticula-aurora',
    contornoShort: 32,
    fundoShort: 'palco',
    estiloDaLegenda: 'contorno',
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } },
    cabecalhoAtivo: true,
    mostrarImagem: true,
    mostrarNome: true,
    mostrarHandle: true,
    nome: '',
    handle: '',
    cabecalhoEscala: 1,
    cabecalhoPosicao: { automatica: false, x: 64, y: 64 },
    cabecalhoPosicaoShort: { automatica: true, x: 0, y: 0 },
    placaAtiva: true,
    placaEscala: 1,
    placaPosicao: { automatica: true, x: 0, y: 0 },
    ...over,
  };
}

describe('seções do modal por estilo (D-937)', () => {
  it('no limpo some a textura do antigo e aparece o palco limpo no lugar dela', () => {
    const limpo = numerarSecoes({ emPreset: false, limpo: true });
    expect(limpo.fundo).toBeUndefined();
    expect(limpo.janelasDoAtual).toBeUndefined();
    expect(limpo).toMatchObject({ moldura: 4, palcoLimpo: 5, legenda: 6, preset: 7 });
  });

  it('no antigo ficam a textura e as janelas do antigo, sem o palco limpo', () => {
    const atual = numerarSecoes({ emPreset: false, limpo: false });
    expect(atual.palcoLimpo).toBeUndefined();
    expect(atual).toMatchObject({ moldura: 4, fundo: 5, legenda: 6, preset: 7, janelasDoAtual: 8 });
  });

  it('no preset não há moldura nem palco do corte, e a numeração não pula', () => {
    expect(numerarSecoes({ emPreset: true, limpo: true })).toEqual({ fundo: 4, legenda: 5, preset: 6 });
  });
});

describe('cabeçalho arrastável no short (D-937)', () => {
  it('mover fixa a posição no short; a alça muda o tamanho', () => {
    let atual: RascunhoDoPalco | null = rascunho();
    const mudar = vi.fn((f: unknown) => {
      atual = (f as (r: RascunhoDoPalco | null) => RascunhoDoPalco | null)(atual);
    });
    const edicao = () => edicaoDoCabecalhoNoShort(atual!, mudar, 'cabecalho', vi.fn());
    edicao().mover('cabecalho', 120.4, 300.6);
    expect(atual!.cabecalhoPosicaoShort).toEqual({ automatica: false, x: 120, y: 301 });
    edicao().escalar('cabecalho', 1.6);
    expect(atual!.cabecalhoEscala).toBe(1.6);
    expect(edicao().escala('cabecalho')).toBe(1.6);
  });

  it('só existe no limpo e com o cabeçalho ligado', () => {
    const palco = (r: RascunhoDoPalco) => ({ rascunho: r, mudar: vi.fn() }) as never;
    const quadroRef = createRef<HTMLDivElement>();
    expect(renderToStaticMarkup(<CabecalhoArrastavelNoShort palco={palco(rascunho({ estilo: 'atual' }))} quadroRef={quadroRef} />)).toBe('');
    expect(renderToStaticMarkup(<CabecalhoArrastavelNoShort palco={palco(rascunho({ cabecalhoAtivo: false }))} quadroRef={quadroRef} />)).toBe('');
  });

  it('o arraste conhece o quadro vertical: a caixa para na borda do short', () => {
    const caixa = { x: 900, y: 1700, w: 100, h: 60 };
    expect(caixaEsticada(caixa, 500, 500, 40, QUADRO_DO_SHORT)).toEqual({ x: 900, y: 1700, w: 180, h: 220 });
  });

  it('a guia de alinhamento cai na proporção do short, não na do vídeo', () => {
    const html = renderToStaticMarkup(<GuiasNaPrevia guias={{ x: 540, y: 960 }} quadro={QUADRO_DO_SHORT} />);
    expect(html).toContain('left:50%');
    expect(html).toContain('top:50%');
  });
});
