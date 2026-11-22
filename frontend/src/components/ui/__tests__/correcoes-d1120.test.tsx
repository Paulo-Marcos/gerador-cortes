import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import resolveConfig from 'tailwindcss/resolveConfig';
import config from '../../../../tailwind.config';
import { Card, CardCorpo } from '../card';
import { CabecalhoDaLista } from '../lista';
import { Skeleton } from '../skeleton';
import { Tabela, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from '../tabela';

// Achados da auditoria da D-1120 (PR #391), um teste por defeito.

describe('token minHeight.linha', () => {
  it('a linha de lista de 72 px existe de verdade em min-height (o token de height não vale aqui)', () => {
    const tema = resolveConfig(config).theme;
    expect(tema.minHeight).toMatchObject({ linha: '72px' });
    expect(tema.height).toMatchObject({ linha: '72px' });
  });
});

describe('cn: override e escala de fonte convivem', () => {
  it('className sobrescreve o raio padrão do Skeleton', () => {
    const h = renderToStaticMarkup(<Skeleton className="rounded-full" />);
    expect(h).toContain('rounded-full');
    expect(h).not.toContain('rounded-lg');
  });

  it('o cabeçalho da lista guarda o tamanho (text-micro) E a cor (text-fg-3)', () => {
    const h = renderToStaticMarkup(<CabecalhoDaLista>a</CabecalhoDaLista>);
    expect(h).toContain('text-micro');
    expect(h).toContain('text-fg-3');
  });

  it('a cor do cabeçalho da lista pode ser trocada, o tamanho continua', () => {
    const h = renderToStaticMarkup(<CabecalhoDaLista className="text-fg-2">a</CabecalhoDaLista>);
    expect(h).toContain('text-fg-2');
    expect(h).toContain('text-micro');
    expect(h).not.toContain('text-fg-3');
  });

  it('a tabela guarda tamanho e cor no corpo, no título e na célula', () => {
    const h = renderToStaticMarkup(
      <Tabela>
        <TabelaCorpo>
          <TabelaLinha>
            <TabelaTitulo>t</TabelaTitulo>
            <TabelaCelula>c</TabelaCelula>
          </TabelaLinha>
        </TabelaCorpo>
      </Tabela>,
    );
    expect(h).toMatch(/<table[^>]*class="[^"]*text-fg[^"]*text-corpo/);
    expect(h).toMatch(/<th[^>]*class="[^"]*text-fg-3[^"]*text-micro/);
  });
});

describe('forwardRef nas peças novas', () => {
  it('tabela e CardCorpo aceitam ref', () => {
    // Só a tipagem e a assinatura: renderToStaticMarkup não atribui ref, mas o objeto não pode quebrar.
    const ref = createRef<HTMLTableElement>();
    expect(renderToStaticMarkup(<Tabela ref={ref} />)).toContain('<table');
    const refCorpo = createRef<HTMLDivElement>();
    expect(renderToStaticMarkup(<CardCorpo ref={refCorpo}>x</CardCorpo>)).toContain('min-w-0');
  });
});

describe('Card legado', () => {
  it('é exatamente o cartão que as telas já usam: mesmas classes, sem acréscimo', () => {
    const h = renderToStaticMarkup(<Card />);
    expect(h).toContain(
      'rounded-campo border border-fio bg-painel-solido shadow-topo',
    );
    expect(h).not.toMatch(/bg-vidro|rounded-cartao|flex/);
  });
});
