import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../ActionBar';

// D-858: o ajuste da Leitura ("Editar autor e parte") é o conceito Editar — a
// caneta do dicionário. O rótulo chega por variável, então a catraca de
// conceitos não o vê: este teste é a trava (achado da auditoria do #107).
const leitura = (ativo: boolean) => ({
  texto: 'Leitura',
  icone: 'book-open' as const,
  ativo,
  cor: 'var(--info)',
  corSuave: 'var(--info-soft)',
  editar: { titulo: 'Editar autor e parte (Leitura)', onClick: vi.fn() },
});

const barra = (ativo: boolean) => ({
  primario: { texto: 'Aprovar', icone: 'check' as const },
  alternancias: [leitura(ativo)],
});

describe('ActionBar — alternância com ajuste', () => {
  it('ligada, o ajuste ao lado desenha a caneta do dicionário', () => {
    const html = renderToStaticMarkup(<ActionBar barra={barra(true)} />);
    const ajuste = html.match(/<button[^>]*aria-label="Editar autor e parte \(Leitura\)"[^>]*>.*?<\/button>/s)?.[0] ?? '';
    expect(ajuste).toContain('lucide-pen"');
  });

  it('desligada, o ajuste não aparece', () => {
    const html = renderToStaticMarkup(<ActionBar barra={barra(false)} />);
    expect(html).not.toContain('Editar autor e parte');
  });
});

// D-870: o motivo do principal desabilitado — no Workspace, a lista de
// pendências de uma live grande fazia a barra crescer a 90 px.
describe('ActionBar — motivo do principal desligado', () => {
  const longo = 'Faltam 8 de 8: ' + '#1 (render final) · '.repeat(8);
  const html = renderToStaticMarkup(
    <ActionBar barra={{ primario: { texto: 'Publicar 8 cortes', icone: 'upload', desabilitado: true, motivo: longo } }} />,
  );

  it('no máximo duas linhas na barra', () => {
    expect(html).toMatch(/-webkit-line-clamp:2[^>]*>Faltam 8 de 8/);
  });

  it('o texto inteiro fica no hover', () => {
    expect(html).toContain(`title="${longo}"`);
  });
});
