import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AcaoDeIa, MenuDeIa } from '@/components/ui/acao-de-ia';
import { Card } from '@/components/ui/card';

// D-1124 (auditoria r1): `data-sala` tira o controle do reset da casca antiga. Se um
// controle de aparência LEGADA ganhar o atributo, ele deixa de receber `font: inherit` e
// o anel da casca e muda em telas que não deveriam mudar. Este arquivo cobre os componentes
// que têm as duas aparências ou que só existem no desenho antigo.

const noop = () => {};

describe('D-1124: o desenho antigo segue sem data-sala', () => {
  it('AcaoDeIa legada (provedores e "as duas") não leva o marcador', () => {
    const html = renderToStaticMarkup(
      <>
        <AcaoDeIa rotulo="Gerar" emVoo={null} onGerar={noop} />
        <AcaoDeIa rotulo="Gerar" emVoo={null} onGerar={noop} asDuas={{ onGerar: noop, emVoo: false }} />
      </>,
    );
    expect(html).toContain('<button');
    expect(html).not.toContain('data-sala');
  });

  it('AcaoDeIa da Sala leva o marcador em todos os botões', () => {
    const html = renderToStaticMarkup(
      <AcaoDeIa rotulo="Gerar" emVoo={null} onGerar={noop} aparencia="sala-escura" asDuas={{ onGerar: noop, emVoo: false }} />,
    );
    const botoes = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(botoes.length).toBeGreaterThanOrEqual(3);
    for (const b of botoes) expect(b).toContain('data-sala');
  });

  it('MenuDeIa (só existe no desenho antigo) não leva o marcador', () => {
    const html = renderToStaticMarkup(<MenuDeIa rotulo="Gerar" icone="sparkles" onGerar={noop} />);
    expect(html).toContain('<button');
    expect(html).not.toContain('data-sala');
  });

  it('Card legado não leva o marcador; o de vidro leva', () => {
    expect(renderToStaticMarkup(<Card>a</Card>)).not.toContain('data-sala');
    expect(renderToStaticMarkup(<Card variante="vidro">a</Card>)).toContain('data-sala');
  });
});
