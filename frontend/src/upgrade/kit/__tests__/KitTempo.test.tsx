import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KitTempo } from '../KitTempo';

describe('KitTempo (D-1121)', () => {
  const html = renderToStaticMarkup(<KitTempo />);

  it('mostra o mapa da live nos dois tamanhos e sem duração', () => {
    expect(html.match(/aria-label="Mapa da live"/g)).toHaveLength(3);
    expect(html).toContain('data-tamanho="mini"');
    expect(html).toContain('data-parte="sem-duracao"');
  });

  it('só um corte está aberto em cada mapa com abertoId, e só ele leva aria-current', () => {
    expect(html.match(/aria-current="true"/g)).toHaveLength(2);
  });

  it('mostra a régua com oito dias, hoje marcado e dia sem live tracejado', () => {
    expect(html.match(/data-dia=/g)).toHaveLength(8);
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(html).toContain('data-tem-live="nao"');
  });

  it('mostra os medidores sem nenhuma sigla e com a frase de cada um', () => {
    expect(html.match(/aria-label="Etapas do corte:/g)).toHaveLength(5);
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/\b(BRU|GRD|OVL|THU|MET)\b/);
    expect(html).toContain('corte rejeitado');
    expect(html).toContain('no ar');
  });

  it('mostra o anel e o progresso', () => {
    expect(html).toContain('aria-label="Nota da IA: 24 de 30"');
    expect(html.match(/role="progressbar"/g)).toHaveLength(3);
  });
});
