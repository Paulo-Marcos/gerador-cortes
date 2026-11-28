import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MapaDaLive, type CorteDoMapa } from '../mapa-da-live';

// D-1153: no mapa compacto, cortes curtos e vizinhos encostavam os números ("3 4 5"). A pílula
// tem um piso de 16 px, então a largura DELA não diz se o número cabe: quem diz é a faixa que o
// corte ocupa de verdade na pista. Como não há layout no teste, ele lê do HTML a regra que o
// CSS vai aplicar (faixa em cqw + mínimo da @container) e faz a conta em larguras de pista reais.

const DURACAO = 3 * 3600;
const curto = (numero: number, inicioSeg: number, duraSeg: number): CorteDoMapa => ({
  id: `c${numero}`,
  numero,
  nome: `Corte curto ${numero}`,
  inicioSeg,
  fimSeg: inicioSeg + duraSeg,
  estado: 'proposto',
});

const CORTES = [
  curto(1, 600, 900),
  curto(3, 3600, 150),
  curto(4, 3780, 150),
  curto(5, 3960, 150),
  curto(9, 6000, 700),
  curto(10, 6700, 700),
  curto(11, 7400, 320),
];

const PISO_PX = 16;
/** Um dígito da fonte mono em `text-micro`, com folga. */
const DIGITO_PX = 7;

function numerosVisiveis(html: string, pistaPx: number) {
  return [...html.matchAll(/<a [\s\S]*?<\/a>/g)].flatMap(([a]) => {
    const pct = (nome: string) => Number(new RegExp(`--${nome}:([\\d.]+)`).exec(a)![1]);
    const numero = />(\d+)<\/span>/.exec(a)![1];
    const faixaPx = (pct('largura') / 100) * pistaPx;
    const minimo = /\[@container_\(min-width:(\d+)px\)\]:inline/.exec(a);
    if (/[\s"]hidden[\s"]/.test(a)) {
      expect(minimo, 'número escondido precisa de uma regra que o mostre').not.toBeNull();
      // A faixa que o CSS mede é a do corte, não a da pílula com o piso.
      expect(pct('faixa')).toBe(pct('largura'));
      if (faixaPx < Number(minimo![1])) return [];
    }
    const centro = (pct('inicio') / 100) * pistaPx + Math.max(faixaPx, PISO_PX) / 2;
    const meia = (numero.length * DIGITO_PX) / 2;
    return [{ numero, de: centro - meia, ate: centro + meia }];
  });
}

const mini = renderToStaticMarkup(
  <MapaDaLive tamanho="mini" duracaoSeg={DURACAO} cortes={CORTES} />,
);

describe('mapa compacto com cortes curtos e vizinhos', () => {
  it.each([260, 380, 500, 720, 1100])('pista de %i px: nenhum número se sobrepõe', (px) => {
    const numeros = numerosVisiveis(mini, px);
    for (let i = 1; i < numeros.length; i++) {
      const [a, b] = [numeros[i - 1], numeros[i]];
      expect(b.de - a.ate, `${a.numero} e ${b.numero} encostados`).toBeGreaterThanOrEqual(2);
    }
  });

  it('o número fica onde cabe e some onde a faixa é menor que ele', () => {
    const em500 = numerosVisiveis(mini, 500).map((n) => n.numero);
    expect(em500).toEqual(['1', '9', '10']);
  });

  it('a pista é a referência da medida', () => {
    expect(mini).toContain('[container-type:inline-size]');
  });

  it('o aria-label de cada corte mantém o número', () => {
    for (const c of CORTES) expect(mini).toContain(`aria-label="Corte ${c.numero}, ${c.nome},`);
  });

  it('o mapa grande não muda: todo número aparece, sem medida nenhuma', () => {
    const grande = renderToStaticMarkup(<MapaDaLive duracaoSeg={DURACAO} cortes={CORTES} />);
    expect(grande).not.toContain('container');
    expect(grande).not.toContain('--faixa');
    expect(grande).not.toMatch(/[\s"]hidden[\s"]/);
  });

  it('sem duração os cortes se enfileiram, e o número fica', () => {
    const fila = renderToStaticMarkup(
      <MapaDaLive tamanho="mini" duracaoSeg={0} cortes={CORTES} />,
    );
    expect(fila).not.toContain('--faixa');
    expect(fila).not.toMatch(/[\s"]hidden[\s"]/);
  });
});
