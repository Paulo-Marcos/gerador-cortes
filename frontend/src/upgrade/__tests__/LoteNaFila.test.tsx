import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotePublicacao } from '@/features/shorts/shortsApi';
import { LOTE_KEY } from '@/features/shorts/useLotePublicacao';
import { LoteNaFila, dispensarLote, useLoteDaFila } from '../LoteNaFila';
import { aoPedirGavetaDaFila, pedirGavetaDaFila } from '../useGavetaDaFila';

// D-897: o envio em lote deixa o modal e passa a ser acompanhado na gaveta da
// fila, que mora na casca e sobrevive à troca de projeto.

const LOTE: LotePublicacao = {
  lote_id: 'l1',
  criado_em: '2026-10-08T10:00:00',
  terminou: false,
  cancelado: false,
  tiktok_assistido: true,
  instagram_assistido: false,
  publicar_sozinho: false,
  raias: [
    {
      plataforma: 'tiktok',
      rotulo: 'TikTok',
      exige_humano: true,
      aviso: '',
      itens: [
        {
          alvo_id: 'a1',
          alvo_tipo: 'short',
          plataforma: 'tiktok',
          plataforma_rotulo: 'TikTok',
          rotulo: 'O erro que toda igreja comete',
          estado: 'preparando',
          detalhe: 'enviando o vídeo',
          url: '',
        },
      ],
    },
  ],
};

let guardado: Record<string, string> = {};

beforeEach(() => {
  guardado = {};
  // Ambiente node: uma janela de mentira que guarda e despacha eventos.
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (k: string) => guardado[k] ?? null,
        setItem: (k: string, v: string) => {
          guardado[k] = v;
        },
      },
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function comCache(lote: LotePublicacao | null, filho: ReactNode): string {
  const cliente = new QueryClient();
  cliente.setQueryData(LOTE_KEY, { lote });
  return renderToStaticMarkup(<QueryClientProvider client={cliente}>{filho}</QueryClientProvider>);
}

function LoteDaGaveta() {
  return <LoteNaFila lote={useLoteDaFila()} />;
}

describe('o lote na gaveta da fila', () => {
  it('mostra as raias, o andamento e o cancelar enquanto o lote corre', () => {
    const html = comCache(LOTE, <LoteDaGaveta />);

    expect(html).toContain('Publicação em lote');
    expect(html).toContain('O erro que toda igreja comete');
    expect(html).toContain('0/1 publicado');
    expect(html).toContain('aria-label="Cancelar o lote"');
    // Empilhado: na largura da gaveta, três colunas viram tiras.
    expect(html).not.toContain('md:grid-cols-3');
  });

  it('lote terminado troca o cancelar por tirar da lista', () => {
    const html = comCache({ ...LOTE, terminou: true }, <LoteDaGaveta />);

    expect(html).toContain('aria-label="Tirar o lote da lista"');
    expect(html).not.toContain('aria-label="Cancelar o lote"');
  });

  it('tirado da lista, some da gaveta; um lote novo volta a aparecer', () => {
    dispensarLote('l1');

    expect(comCache(LOTE, <LoteDaGaveta />)).toBe('');
    expect(comCache({ ...LOTE, lote_id: 'l2' }, <LoteDaGaveta />)).toContain('Publicação em lote');
  });

  it('sem lote, não ocupa lugar', () => {
    expect(comCache(null, <LoteDaGaveta />)).toBe('');
  });
});

describe('pedir a gaveta de qualquer tela', () => {
  it('o pedido chega a quem escuta, até desligar', () => {
    const abrir = vi.fn();
    const desligar = aoPedirGavetaDaFila(abrir);

    pedirGavetaDaFila();
    desligar();
    pedirGavetaDaFila();

    expect(abrir).toHaveBeenCalledTimes(1);
  });
});

// Os modais vivem em telas inteiras (sem DOM aqui): o contrato é lido na fonte,
// como o rodapé do workspace já faz.
const fonte = (arquivo: string) => readFileSync(resolve(__dirname, '../..', arquivo), 'utf-8');

describe('quem dispara o lote leva o operador à gaveta', () => {
  it('shorts (YouTube Shorts, TikTok, Instagram): fecha o modal e abre a gaveta no sucesso', () => {
    const modal = fonte('features/shorts/PublicarEmLoteModal.tsx');

    expect(modal).toMatch(/\{ onSuccess: acompanharNaFila \}/);
    expect(modal).toMatch(/acompanharNaFila = \(\) => \{\s*onClose\(\);\s*pedirGavetaDaFila\(\);/);
  });

  it('TikTok horizontal: o "subir todos" avisa o modal, que fecha e abre a gaveta', () => {
    expect(fonte('features/projeto-detalhe/LoteDoTiktokHorizontal.tsx')).toMatch(/\{ onSuccess: onDisparado \}/);
    expect(fonte('features/projeto-detalhe/PublicarTiktokModal.tsx')).toMatch(
      /onDisparado=\{\(\) => \{\s*onClose\(\);\s*pedirGavetaDaFila\(\);/,
    );
  });

  it('YouTube em massa: enfileirado, fecha e abre a gaveta (os uploads já são jobs da fila)', () => {
    expect(fonte('features/projeto-detalhe/PublicarMassaModal.tsx')).toMatch(
      /invalidateQueries\(\{ queryKey: exportStatusKey\(projetoId\) \}\);[\s\S]{0,160}onClose\(\);\s*pedirGavetaDaFila\(\);\s*\} catch/,
    );
  });

  it('a gaveta da fila mostra o lote e a casca escuta o pedido', () => {
    expect(fonte('upgrade/GavetaDaFila.tsx')).toContain('<LoteNaFila lote={lote} />');
    expect(fonte('upgrade/UpgradeShell.tsx')).toMatch(/useGavetaDaFila\(pathname\)/);
  });
});
