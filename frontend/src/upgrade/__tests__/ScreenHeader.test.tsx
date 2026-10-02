import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AcoesDaTela } from '../ScreenHeader';

// D-858: a ação de IA do cabeçalho ignorava o `icone` — "Analisar padrões"
// pedia o cérebro e saía com o brilho do "IA gera" (achado da auditoria do
// #107). O ícone da ação agora vai para o AcaoDeIa.
const rotuloDaIa = (html: string) => html.slice(0, html.indexOf('<button'));

describe('AcoesDaTela', () => {
  it('a ação de IA desenha o ícone que recebeu', () => {
    const html = renderToStaticMarkup(
      <AcoesDaTela
        acoes={[{ icone: 'brain', texto: 'Analisar padrões', ia: { emVoo: null, onGerar: vi.fn() } }]}
      />,
    );
    expect(rotuloDaIa(html)).toMatch(/<svg[^>]*lucide-brain/);
    expect(rotuloDaIa(html)).toContain('Analisar padrões');
  });

  it('a ação comum desenha o ícone ao lado do texto', () => {
    const html = renderToStaticMarkup(<AcoesDaTela acoes={[{ icone: 'upload', texto: 'Publicar' }]} />);
    expect(html).toMatch(/<button[^>]*><svg[^>]*lucide-upload[^>]*>.*Publicar<\/button>/s);
  });
});
