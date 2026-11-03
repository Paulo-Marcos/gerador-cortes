import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { avisosDaCena } from '@/features/editor/useCenas';
import type { CenaRemotion } from '@/types/models';
import { OrigemDaCena } from '../CenaComOrigem';

// D-1018: a origem da cena na aprovação. Só mostra e avisa; quem decide é o operador.

const cena = (campos: Partial<CenaRemotion>): CenaRemotion =>
  ({ tipo: 'enfase', inicio: 12, fim: 18, texto: 'Tese', ...campos }) as CenaRemotion;

const html = (c: CenaRemotion, avisos: string[] = []) =>
  renderToStaticMarkup(<OrigemDaCena cena={c} avisos={avisos} onChange={vi.fn()} />);

describe('a origem da cena', () => {
  it('mostra a frase literal e quem disse', () => {
    const saida = html(cena({ frase_da_fala: 'por aí você não vai', quem_disse: 'apresentador' }));
    expect(saida).toContain('por aí você não vai');
    expect(saida).toContain('apresentador');
  });

  it('dá nome legível ao vídeo reagido', () => {
    expect(html(cena({ frase_da_fala: 'x', quem_disse: 'video_reagido' }))).toContain('vídeo reagido');
  });

  it('mostra cada aviso da conferência', () => {
    const saida = html(cena({}), ['O texto entre aspas não é o que foi dito.']);
    expect(saida).toContain('O texto entre aspas não é o que foi dito.');
  });

  it('o tipo que afirma um fato pede a fonte, mesmo sem nada escrito', () => {
    const saida = html(cena({ tipo: 'destaque_numerico', numero: '50x' }));
    expect(saida).toContain('Fonte');
    expect(saida).toContain('Só o que você conferiu');
  });

  it('mostra a fonte que já existe', () => {
    expect(html(cena({ tipo: 'citacao_autor', fonte: 'Folha, 2025' }))).toContain('value="Folha, 2025"');
  });

  it('não ocupa espaço na cena que não afirma nada', () => {
    expect(html(cena({ tipo: 'enfase' }))).toBe('');
  });

  it('o campo de fonte só muda a fonte da cena, e vazio apaga o campo', () => {
    const onChange = vi.fn();
    const original = cena({ tipo: 'destaque_numerico', numero: '50x', fonte: 'IBGE' });
    const elemento = OrigemDaCena({ cena: original, avisos: [], onChange });
    const procurar = (no: unknown): { props: { onChange: (e: unknown) => void } } | null => {
      if (!no || typeof no !== 'object' || !('props' in no)) return null;
      const props = (no as { type?: unknown; props: { children?: unknown } }).props;
      if ((no as { type?: unknown }).type === 'input') return no as never;
      const filhos = ([] as unknown[]).concat(props.children ?? []);
      for (const filho of filhos) {
        const achado = procurar(filho);
        if (achado) return achado;
      }
      return null;
    };
    const input = procurar(elemento);
    input?.props.onChange({ target: { value: 'TSE' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...original, fonte: 'TSE' });
    input?.props.onChange({ target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...original, fonte: undefined });
  });
});

describe('os avisos de uma cena', () => {
  const avisos = [
    { tipo: 'enfase', inicio: 12, mensagem: 'desta' },
    { tipo: 'enfase', inicio: 40, mensagem: 'de outra em outro tempo' },
    { tipo: 'destaque_numerico', inicio: 12, mensagem: 'de outro tipo no mesmo tempo' },
  ];

  it('pega só os do mesmo tipo e início', () => {
    expect(avisosDaCena(avisos, { tipo: 'enfase', inicio: 12 })).toEqual(['desta']);
  });

  it('cena movida e ainda não salva fica sem aviso até conferir de novo', () => {
    expect(avisosDaCena(avisos, { tipo: 'enfase', inicio: 13 })).toEqual([]);
  });
});
