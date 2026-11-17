import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';

const render = () =>
  renderToStaticMarkup(
    <Tabs defaultValue="mapa">
      <TabsList aria-label="Visões da live">
        <TabsTrigger value="mapa">Mapa</TabsTrigger>
        <TabsTrigger value="lista">Lista</TabsTrigger>
        <TabsTrigger value="fila" disabled>
          Fila
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mapa">painel do mapa</TabsContent>
      <TabsContent value="lista">painel da lista</TabsContent>
    </Tabs>,
  );

describe('Tabs', () => {
  it('é tablist/tab/tabpanel, com a aba atual selecionada e só o painel dela montado', () => {
    const h = render();
    expect(h).toContain('role="tablist"');
    expect(h.match(/role="tab"/g)).toHaveLength(3);
    expect(h).toContain('aria-selected="true"');
    expect(h).toContain('painel do mapa');
    expect(h).not.toContain('painel da lista');
  });

  it('o traço da aba ativa é o feixe, e só dela', () => {
    const h = render();
    expect(h).toContain('data-[state=active]:after:bg-feixe');
    expect(h.match(/data-state="active"/g)).toHaveLength(2); // aba + painel
  });

  it('tem foco visível, desabilitada apagada e a linha de baixo em fio', () => {
    const h = render();
    expect(h).toContain('focus-visible:outline-foco');
    expect(h).toContain('disabled:text-fg-off');
    expect(h).toContain('border-b border-fio');
  });

  it('sem backdrop-filter', () => {
    expect(render()).not.toContain('backdrop');
  });
});
