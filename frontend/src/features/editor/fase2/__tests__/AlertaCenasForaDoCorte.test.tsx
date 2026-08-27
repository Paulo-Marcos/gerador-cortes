import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlertaCenasForaDoCorte } from '../AlertaCenasForaDoCorte';

// A timeline e clampada no video, entao a cena alem do fim some dela: este
// alerta e a UNICA pista de que ela existe.
describe('AlertaCenasForaDoCorte', () => {
  it('nao renderiza nada quando esta tudo dentro do corte', () => {
    expect(renderToStaticMarkup(<AlertaCenasForaDoCorte fora={[]} duracaoCorte={980.3} />)).toBe('');
  });

  it('denuncia a cena com o tempo absoluto da live', () => {
    const html = renderToStaticMarkup(
      <AlertaCenasForaDoCorte
        fora={[{ indice: 9, inicio: 1370.88, fim: 1375.88 }]}
        duracaoCorte={980.3}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('1 cena(s) com tempo fora do corte');
    expect(html).toContain('16:20'); // fim do corte (980,3s)
    expect(html).toContain('22:50'); // inicio da cena (1370,88s)
    expect(html).toContain('cena 10'); // indice 9 -> 1-based para o operador
  });

  it('cita a cena de maior inicio, nao a primeira da lista', () => {
    const html = renderToStaticMarkup(
      <AlertaCenasForaDoCorte
        fora={[
          { indice: 9, inicio: 1370.88, fim: 1375.88 },
          { indice: 20, inicio: 2290.04, fim: 2294.04 },
        ]}
        duracaoCorte={980.3}
      />,
    );
    expect(html).toContain('2 cena(s) com tempo fora do corte');
    expect(html).toContain('38:10'); // 2290,04s — a mais ilustrativa
  });
});
