import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EmbasamentoItem } from '../api';
import { RankingEmbasamentoPanel } from '../RankingEmbasamentoPanel';

// D-1176: "Entenda a nota" vira o Dialog da Sala escura com uma Tabela; a nota final é a soma.

const ITENS = [
  { criterio: 'views', rotulo: 'Audiência', valor_bruto: 12000, valor_normalizado: 0.8, peso: 0.5, contribuicao: 40 },
  { criterio: 'sentimento', rotulo: 'Tom do público', valor_bruto: 7.5, valor_normalizado: 0.6, peso: 0.5, contribuicao: 30 },
] as unknown as EmbasamentoItem[];

describe('RankingEmbasamentoPanel (D-1176)', () => {
  const html = renderToStaticMarkup(
    <RankingEmbasamentoPanel titulo="Live 1" pontuacaoTotal={70} embasamento={ITENS} destaques={['gostei']} onClose={() => undefined} />,
  );

  it('é um diálogo com título que diz a nota', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Por que essa nota? 70 pontos');
  });

  it('mostra os critérios numa Tabela e a soma como nota final', () => {
    expect(html).toContain('<table');
    expect(html).toContain('Audiência');
    expect(html).toContain('12.000 views');
    expect(html).toContain('80%');
    expect(html).toContain('Nota final (soma)');
    expect(html).toContain('70.0');
  });

  it('lista os comentários que justificam o tom', () => {
    expect(html).toContain('Comentários que justificam o tom');
    expect(html).toContain('gostei');
  });
});
