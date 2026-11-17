// D-1123 (E-069): componentes novos usam a escala do tailwind.config (`text-micro`…`text-display`),
// e o tamanho sobrevive dentro do `cn` (corrigido na D-1122), sem o contorno de "fora do cn".
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';
import { Chip } from '../chip';
import { Etiqueta } from '../etiqueta';
import { Lista, CabecalhoDaLista } from '../lista';
import { Selo } from '../selo';
import { Tabela, TabelaTitulo } from '../tabela';

const NOVOS = [
  'acao-de-ia', 'button', 'cartao-de-opcao', 'chip', 'etiqueta', 'field', 'kbd',
  'link-de-acao', 'segmented', 'select', 'selo-provider', 'selo', 'tabs', 'lista', 'tabela',
];
const lerFonte = (n: string) => readFileSync(resolve(__dirname, '..', `${n}.tsx`), 'utf8');

describe('escala de fonte dos componentes novos (D-1123)', () => {
  it.each(NOVOS)('%s não usa text-[Npx] das medidas da escala', (nome) => {
    expect(lerFonte(nome)).not.toMatch(/text-\[(11|12|13|14)px\]/);
  });

  it('o tamanho da escala convive com a cor dentro do cn', () => {
    expect(cn('text-fg', 'text-pequeno')).toBe('text-fg text-pequeno');
    expect(cn('text-micro text-fg-3')).toBe('text-micro text-fg-3');
    expect(cn('text-pequeno', 'text-corpo')).toBe('text-corpo');
  });

  it('selo, chip e etiqueta carregam o tamanho da escala', () => {
    const h = renderToStaticMarkup(
      <div>
        <Selo tom="ok">selo</Selo>
        <Chip>chip</Chip>
        <Etiqueta>etq</Etiqueta>
      </div>,
    );
    expect(h).toMatch(/class="[^"]*text-pequeno[^"]*"[^>]*>(<[^>]*>)*selo/);
    expect(h).toContain('text-micro');
    expect(h).not.toMatch(/text-\[(11|12|13|14)px\]/);
  });

  it('lista e tabela: a cor trocada por className não apaga o tamanho', () => {
    const h = renderToStaticMarkup(
      <>
        <Lista colunas="1fr">
          <CabecalhoDaLista className="text-fg">c</CabecalhoDaLista>
        </Lista>
        <Tabela>
          <thead>
            <tr>
              <TabelaTitulo className="text-fg-2">t</TabelaTitulo>
            </tr>
          </thead>
        </Tabela>
      </>,
    );
    expect(h).toMatch(/<li[^>]*class="[^"]*text-fg[^"]*text-micro/);
    expect(h).toMatch(/<th[^>]*class="[^"]*text-fg-2[^"]*text-micro/);
    expect(h).toMatch(/<table[^>]*class="[^"]*text-corpo/);
  });
});
