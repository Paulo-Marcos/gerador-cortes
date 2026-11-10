import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Desvio } from '@/types/models';
import { FaixaDoBruto } from '../FaixaDoBruto';

// D-1094: a faixa "O bruto vai ter" na tela, e o lugar dela: abaixo da linha do tempo.

vi.mock('../PlayerPanel', () => ({ PlayerPanel: () => null }));
vi.mock('../TimelinePanel', () => ({ TimelinePanel: () => 'LINHA-DO-TEMPO' }));
vi.mock('../RightTabsPanel', () => ({ RightTabsPanel: () => null }));

const { EditorFase1 } = await import('../EditorFase1');

const textoDe = (html: string) => html.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);

const trecho = (inicio_hms: string, fim_hms: string): Desvio => ({ inicio_hms, fim_hms, motivo: '' });
const CORTE = {
  inicio_seg: 0,
  fim_seg: 1211,
  desvios: [
    trecho('00:01:00.000', '00:02:00.000'),
    trecho('00:10:00.000', '00:11:28.000'),
    trecho('00:10:30.000', '00:11:00.000'),
  ],
};

describe('FaixaDoBruto (D-1094)', () => {
  it('mostra o título, o fica, o sai e a sincronia, na ordem do board', () => {
    const html = renderToStaticMarkup(<FaixaDoBruto corte={CORTE} audioOffsetMs={0} />);
    expect(textoDe(html)).toEqual([
      'O BRUTO VAI TER',
      'fica 17:43',
      ' de 20:11',
      'sai 2:28 em 3 trechos (1 dentro de outro)',
      'sincronia do áudio 0 ms',
    ]);
    expect(html).toContain('aria-label="O bruto vai ter"');
  });

  it('só leitura: a sincronia não tem controle na faixa (quem ajusta é a pergunta do som)', () => {
    const html = renderToStaticMarkup(<FaixaDoBruto corte={CORTE} audioOffsetMs={40} />);
    expect(html).toContain('sincronia do áudio +40 ms');
    expect(html).not.toMatch(/<(button|input)/);
  });

  it('a bancada mostra a faixa logo abaixo da linha do tempo, com a sincronia atual', () => {
    const props = {
      corte: CORTE,
      audioOffsetMs: -30,
      pending: {},
    } as unknown as Parameters<typeof EditorFase1>[0];
    const html = renderToStaticMarkup(<EditorFase1 {...props} />);
    const linha = html.indexOf('LINHA-DO-TEMPO');
    const faixa = html.indexOf('O BRUTO VAI TER');
    expect(linha).toBeGreaterThan(-1);
    expect(faixa).toBeGreaterThan(linha);
    expect(html).toContain('sincronia do áudio -30 ms');
  });

  it('a faixa é componente próprio: a linha do tempo não cresce por ela', () => {
    const fonte = readFileSync(resolve(__dirname, '../TimelinePanel.tsx'), 'utf8');
    expect(fonte).not.toContain('FaixaDoBruto');
  });
});
