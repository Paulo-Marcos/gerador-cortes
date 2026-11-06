import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CenaNumeroLimpo } from '@video-renderer/cenas-limpo/cenas-coluna';
import { conferenciaDaOrigemKey, corteKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import { CenaComOrigem, OrigemDaCena } from '../CenaComOrigem';

// D-1018: a ligação de ponta a ponta. A auditoria desfez a do painel e a do card, e
// nenhum teste caiu: estes prendem quem usa o quê.

const cena = (campos: Partial<CenaRemotion>): CenaRemotion =>
  ({ tipo: 'destaque_numerico', inicio: 12, fim: 18, numero: '50x', ...campos }) as CenaRemotion;

function comCache(avisos: { tipo: string; inicio: number; codigo: string; mensagem: string }[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(corteKey('c1'), { id: 'c1' });
  const versao = qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0;
  qc.setQueryData(conferenciaDaOrigemKey('c1', versao), { avisos });
  return qc;
}

describe('o aviso chega à cena certa da lista', () => {
  const render = (avisos: Parameters<typeof comCache>[0]) =>
    renderToStaticMarkup(
      <QueryClientProvider client={comCache(avisos)}>
        <TooltipProvider>
        <CenaComOrigem
          corteId="c1"
          cena={cena({ frase_da_fala: 'vai crescer 50 vezes', quem_disse: 'apresentador' })}
          ativa={false}
          sobreposta={false}
          onChange={vi.fn()}
          origem="conferir"
          onRiscar={vi.fn()}
          onTrazerDeVolta={vi.fn()}
          onSeek={vi.fn()}
        />
        </TooltipProvider>
      </QueryClientProvider>,
    );

  it('mostra o aviso gravado para este tipo e início', () => {
    const saida = render([
      { tipo: 'destaque_numerico', inicio: 12, codigo: 'sem_fonte', mensagem: 'Aviso desta cena' },
    ]);
    expect(saida).toContain('Aviso desta cena');
    expect(saida).toContain('vai crescer 50 vezes');
  });

  it('não mostra o aviso de outra cena', () => {
    const saida = render([
      { tipo: 'destaque_numerico', inicio: 40, codigo: 'sem_fonte', mensagem: 'Aviso de outra' },
    ]);
    expect(saida).not.toContain('Aviso de outra');
  });
});

describe('a cena que perdeu a frase', () => {
  const html = (c: CenaRemotion) =>
    renderToStaticMarkup(<OrigemDaCena cena={c} avisos={[]} onChange={vi.fn()} />);

  it('deixa o operador manter a cena onde está', () => {
    expect(html(cena({ ancora_perdida: true }))).toContain('Manter a cena aqui');
    expect(html(cena({}))).not.toContain('Manter a cena aqui');
  });

  it('manter tira o aviso e a frase guardada, sem mexer no resto', () => {
    const onChange = vi.fn();
    const original = cena({ ancora_perdida: true, frase_ancora: 'a frase' });
    const elemento = OrigemDaCena({ cena: original, avisos: [], onChange });
    const procurar = (no: unknown): ReactElement<{ onClick: () => void }> | null => {
      if (!isValidElement(no)) return null;
      if (no.type === 'button') return no as ReactElement<{ onClick: () => void }>;
      const filhos = ([] as unknown[]).concat((no.props as { children?: unknown }).children ?? []);
      for (const filho of filhos) {
        const achado = procurar(filho);
        if (achado) return achado;
      }
      return null;
    };
    procurar(elemento)?.props.onClick();
    expect(onChange).toHaveBeenCalledWith({
      ...original,
      ancora_perdida: undefined,
      frase_ancora: undefined,
    });
  });
});

describe('o rótulo no card de número', () => {
  const kicker = (c: CenaRemotion) => {
    const elemento = CenaNumeroLimpo({ cena: c }) as ReactElement<{
      children: ReactElement<{ kicker?: string; rodape?: string }>;
    }>;
    return elemento.props.children.props;
  };

  it('no estilo limpo, sem fonte não há rótulo', () => {
    expect(kicker(cena({})).kicker).toBeUndefined();
  });

  it('no estilo limpo, com fonte há o rótulo e o rodapé', () => {
    const props = kicker(cena({ fonte: 'IBGE' }));
    expect(props.kicker).toBe('Dado');
    expect(props.rodape).toBe('IBGE');
  });

  it('o estilo atual usa a mesma regra', () => {
    const fonte = readFileSync(
      resolve(__dirname, '../../../../../../video-renderer/src/cenas-v2/CenaNumber.tsx'),
      'utf-8',
    );
    expect(fonte).toContain('rotuloDoNumero(cena)');
    expect(fonte).not.toContain('"DADO"');
  });
});

describe('o painel de cenas', () => {
  it('lista as cenas com a origem, não só o item', () => {
    const fonte = readFileSync(resolve(__dirname, '../CenasPanel.tsx'), 'utf-8');
    expect(fonte).toContain('<CenaComOrigem corteId={corteId}');
    expect(fonte).not.toContain('<CenaItem');
  });
});
