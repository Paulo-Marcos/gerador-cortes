import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardCorpo, CardHeader, CardTitle } from '../card';

describe('Card', () => {
  it('a API atual segue igual: sem variante é o cartão legado', () => {
    const h = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>T</CardTitle>
        </CardHeader>
        <CardContent>c</CardContent>
      </Card>,
    );
    expect(h).toContain('var(--wb-bg-card)');
    expect(h).toContain('var(--wb-border-soft)');
    expect(h).not.toContain('rounded-cartao');
  });

  it('className segue mesclando sobre o legado', () => {
    expect(renderToStaticMarkup(<Card className="w-40" />)).toContain('w-40');
  });

  it('vidro: raio 20, fio, brilho no topo, sem blur nem feixe', () => {
    const h = renderToStaticMarkup(<Card variante="vidro" />);
    expect(h).toContain('rounded-cartao');
    expect(h).toContain('border-fio');
    expect(h).toContain('shadow-topo');
    expect(h).not.toMatch(/backdrop|feixe|cc-fio|wb-/);
  });

  it('deitado é o mesmo cartão em linha', () => {
    const h = renderToStaticMarkup(<Card variante="deitado" />);
    expect(h).toContain('flex-row');
    expect(h).toContain('rounded-cartao');
  });

  it('só o interativo sobe ao pairar, e respeita reduzir movimento', () => {
    const parado = renderToStaticMarkup(<Card variante="vidro" />);
    const vivo = renderToStaticMarkup(<Card variante="vidro" interativo />);
    expect(parado).not.toContain('hover:-translate-y-0.5');
    expect(vivo).toContain('hover:-translate-y-0.5');
    expect(vivo).toContain('motion-reduce:hover:translate-y-0');
  });

  it('CardCorpo aceita o texto ao lado da capa', () => {
    expect(renderToStaticMarkup(<CardCorpo>x</CardCorpo>)).toContain('min-w-0');
  });
});
