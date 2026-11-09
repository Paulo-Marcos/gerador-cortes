import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastViewport } from '@/components/ui/toaster';
import type { Corte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import { AvisoDoRiscado } from '../AvisoDoRiscado';
import { bloqueioDoRiscar, DICA_NO_YOUTUBE, mensagemDoRiscado, proximoDepoisDeRiscar } from '../riscarCorte';

// D-1088: riscar o corte no lugar de excluir. As regras puras, o botão da
// barra e o aviso que oferece o motivo e o Desfazer.

const corte = (id: string, status = 'proposto', extra: Partial<Corte> = {}) =>
  ({ id, numero: Number(id.slice(1)), titulo_proposto: `Corte ${id}`, status, youtube_video_id: '', ...extra }) as Corte;

describe('bloqueioDoRiscar', () => {
  it('corte no YouTube não se risca, e a dica diz por quê', () => {
    expect(bloqueioDoRiscar(corte('c1', 'processado', { youtube_video_id: 'abc' }))).toBe('Já está no YouTube');
  });

  it('fora do YouTube, risca de qualquer etapa', () => {
    for (const status of ['proposto', 'aprovado', 'processado']) {
      expect(bloqueioDoRiscar(corte('c1', status))).toBeNull();
    }
  });
});

describe('proximoDepoisDeRiscar', () => {
  it('segue para o próximo na ordem, como o excluir fazia', () => {
    expect(proximoDepoisDeRiscar([corte('c1'), corte('c2'), corte('c3')], 'c2')?.id).toBe('c3');
  });

  it('do último volta ao primeiro', () => {
    expect(proximoDepoisDeRiscar([corte('c1'), corte('c2')], 'c2')?.id).toBe('c1');
  });

  it('pula os cortes já riscados', () => {
    const cortes = [corte('c1'), corte('c2'), corte('c3', 'rejeitado'), corte('c4')];
    expect(proximoDepoisDeRiscar(cortes, 'c2')?.id).toBe('c4');
  });

  it('sem outro corte vivo, não há para onde ir', () => {
    expect(proximoDepoisDeRiscar([corte('c1'), corte('c2', 'rejeitado')], 'c1')).toBeNull();
    expect(proximoDepoisDeRiscar([corte('c1')], 'c1')).toBeNull();
  });
});

describe('mensagemDoRiscado', () => {
  it('diz o corte e o disco que voltou', () => {
    expect(mensagemDoRiscado(corte('c3'), 1234.5)).toBe('#3 · Corte c3 · 1,2 GB liberados');
    expect(mensagemDoRiscado(corte('c3'), 80)).toBe('#3 · Corte c3 · 80 MB liberados');
  });

  it('sem mídia solta, não fala de disco', () => {
    expect(mensagemDoRiscado(corte('c3'), 0)).toBe('#3 · Corte c3');
  });
});

describe('o botão Riscar corte na barra', () => {
  const barra = (desabilitado: boolean) => ({
    primario: { texto: 'Aprovar corte', icone: 'check' as const },
    secundario: {
      texto: 'Riscar corte',
      icone: 'x' as const,
      tecla: 'R',
      desabilitado,
      titulo: desabilitado ? DICA_NO_YOUTUBE : 'Riscar corte (R)',
      onClick: vi.fn(),
    },
  });

  it('mostra a tecla R ao lado do texto', () => {
    const html = renderToStaticMarkup(<ActionBar barra={barra(false)} />);
    expect(html).toContain('Riscar corte<kbd>R</kbd>');
    expect(html).toContain('aria-keyshortcuts="R"');
    expect(html).not.toContain('aria-disabled');
  });

  it('no YouTube, fica apagado com a dica, e não com `disabled`, que engole a dica', () => {
    const html = renderToStaticMarkup(<ActionBar barra={barra(true)} />);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Já está no YouTube"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?Riscar corte/);
  });
});

describe('AvisoDoRiscado', () => {
  const motivos = [
    { slug: 'repetido', rotulo: 'Repete outro corte' },
    { slug: 'tema_fraco', rotulo: 'Tema não rende' },
  ];

  it('oferece os motivos do canal e o Desfazer, sem diálogo', () => {
    const html = renderToStaticMarkup(<AvisoDoRiscado motivos={motivos} onMotivos={vi.fn()} onDesfazer={vi.fn()} />);
    expect(html).toContain('Motivo:');
    expect(html).toContain('Repete outro corte');
    expect(html).toContain('Tema não rende');
    expect(html).toContain('Desfazer');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('corte feito na mão não tem motivo a medir', () => {
    const html = renderToStaticMarkup(<AvisoDoRiscado motivos={[]} onMotivos={vi.fn()} onDesfazer={vi.fn()} />);
    expect(html).not.toContain('Motivo:');
    expect(html).toContain('Desfazer');
  });

  it('sem etapa de antes, sem Desfazer', () => {
    const html = renderToStaticMarkup(<AvisoDoRiscado motivos={motivos} onMotivos={vi.fn()} />);
    expect(html).not.toContain('Desfazer');
  });

  it('o aviso desenha o conteúdo que a tela mandou, clicável', () => {
    const html = renderToStaticMarkup(
      <ToastViewport
        toasts={[{ id: 't1', title: 'Corte riscado.', message: '#3 · Corte c3', tone: 'info', conteudo: <b>chips</b> }]}
        onDismiss={vi.fn()}
      />,
    );
    expect(html).toContain('Corte riscado.');
    expect(html).toMatch(/pointer-events-auto[^"]*"><b>chips<\/b>/);
  });
});
