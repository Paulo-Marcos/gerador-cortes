import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KitListas } from '@/upgrade/kit/KitListas';
import { LinhaDaLista } from '../lista';

// D-1154 · DIRECAO §5: na linha riscada, só o título leva o traço. Na `<li>` ele descia
// para a linha toda, e "Trazer de volta" parecia uma ação desligada.
const classesDaLi = (html: string) => /<li[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '';

describe('D-1154 · o traço da linha riscada é só do título', () => {
  it('a <li> riscada não risca o que vai dentro, e segue marcada e esmaecida', () => {
    const html = renderToStaticMarkup(<LinhaDaLista riscada>a</LinhaDaLista>);
    expect(classesDaLi(html)).not.toContain('line-through');
    expect(classesDaLi(html)).toContain('text-fg-3');
    expect(html).toContain('data-riscada="true"');
  });

  it('no mostruário, quem leva o traço é o título da linha riscada, e só ele', () => {
    const riscada = /<li[^>]*data-riscada="true"[^>]*>(.*?)<\/li>/s.exec(renderToStaticMarkup(<KitListas />));
    expect(riscada).not.toBeNull();
    const riscados = riscada![1].match(/class="[^"]*line-through[^"]*"/g) ?? [];
    expect(riscados).toHaveLength(1);
    expect(riscados[0]).toContain('text-linha');
  });
});
