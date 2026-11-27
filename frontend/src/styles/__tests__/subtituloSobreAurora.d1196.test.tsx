// D-1196 (DIRECAO §8.1): dentro de uma live a aurora usa a capa, e o subtítulo do
// cabeçalho fica sobre ela. Com capa clara, `fg-3` de 12 px direto na aurora media
// 1,0:1. A regra que este teste guarda: o subtítulo tem de passar 4,5:1 sobre
// QUALQUER capa, nos dois temas.
//
// Nada aqui é número copiado: as cores e a força da aurora saem do `tokens.css`, e a
// superfície e a cor do texto saem das classes do HTML que cada componente desenha.
// Branco e preto são os extremos de luminância de uma capa (o desfoque e o
// `saturate` não passam deles), então os dois cobrem qualquer imagem.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TituloDaLive } from '@/features/projeto-detalhe/PartesDaTela';
import { LinhaDoTopo } from '@/upgrade/LinhaDoTopo';

vi.mock('@/upgrade/apertoDaBarra', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/upgrade/apertoDaBarra')>();
  return {
    ...real,
    useApertoDaBarra: () => ({ barra: { current: null }, trilha: { current: null }, espacador: { current: null }, nivel: 0 }),
  };
});

const css = readFileSync(resolve(__dirname, '../tokens.css'), 'utf-8');

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

function tema(seletor: string) {
  const i = css.indexOf(seletor);
  if (i < 0) throw new Error(`bloco ausente: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const tokens = new Map([...corpo.matchAll(/(--cc-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const valor = (nome: string) => {
    const v = tokens.get(`--cc-${nome}`);
    if (!v) throw new Error(`token ausente: --cc-${nome}`);
    return v;
  };
  const cor = (nome: string): Rgba => {
    const v = valor(nome);
    const hex = v.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const [r, g, b, a = 1] = v.slice(v.indexOf('(') + 1, v.lastIndexOf(')')).split(',').map(Number);
    return [r, g, b, a];
  };
  return { cor, numero: (nome: string) => Number(valor(nome)) };
}

const sobre = ([r, g, b, a]: Rgba, f: Rgb): Rgb => [r * a + f[0] * (1 - a), g * a + f[1] * (1 - a), b * a + f[2] * (1 - a)];

function contraste(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const CAPAS: Record<string, Rgb> = { branca: [255, 255, 255], cinza: [128, 128, 128], preta: [0, 0, 0] };

/** Os fundos que a aurora pode pôr atrás do texto: o `bg`, com ou sem cada halo, e a capa na força do tema. */
function fundosDaAurora(t: ReturnType<typeof tema>, capa: Rgb): Rgb[] {
  const bg = t.cor('bg').slice(0, 3) as Rgb;
  const comIris = sobre(t.cor('halo-iris'), bg);
  const bases = [bg, comIris, sobre(t.cor('halo-menta'), bg), sobre(t.cor('halo-menta'), comIris)];
  return bases.map((base) => sobre([...capa, t.numero('aurora-forca')], base));
}

/** As classes do elemento cujo texto é exatamente `texto`. */
function classesDo(html: string, texto: string): string[] {
  const achado = new RegExp(`class="([^"]*)"[^>]*>${texto}<`).exec(html);
  if (!achado) throw new Error(`elemento do subtítulo não achado: ${texto}`);
  return achado[1].split(/\s+/);
}

const SUB = 'subtitulo-sob-medida';

const LUGARES: [string, ReactElement][] = [
  ['o resumo da live (Cortes da live)', <TituloDaLive titulo="Live 301 - Planejamento de canal" resumo={SUB} />],
  [
    'o subtítulo da linha do topo (Metadados)',
    <MemoryRouter>
      <LinhaDoTopo trilha={[{ texto: 'Biblioteca', to: '/projetos' }, { texto: 'Metadados' }]} cabecalho={{ sub: SUB }} />
    </MemoryRouter>,
  ],
];

describe.each(LUGARES)('D-1196 · %s', (_nome, elemento) => {
  const classes = classesDo(renderToStaticMarkup(elemento), SUB);
  const texto = classes.map((c) => /^text-(fg(?:-\d)?)$/.exec(c)?.[1]).find(Boolean);
  const superficie = classes.map((c) => /^bg-(painel(?:-solido)?)$/.exec(c)?.[1]).find(Boolean);

  describe.each(['escuro', 'claro'] as const)('tema %s', (qual) => {
    const t = tema(`:root[data-theme='${qual === 'escuro' ? 'dark' : 'light'}']`);

    it.each(Object.keys(CAPAS))('passa 4,5:1 com a capa %s', (capa) => {
      expect(texto, 'o subtítulo declara a cor do texto').toBeDefined();
      const pior = Math.min(
        ...fundosDaAurora(t, CAPAS[capa]).map((aurora) => {
          const fundo = superficie ? sobre(t.cor(superficie), aurora) : aurora;
          return contraste(sobre(t.cor(texto!), fundo), fundo);
        }),
      );
      expect(pior, `${texto} sobre ${superficie ?? 'a aurora nua'}`).toBeGreaterThanOrEqual(4.5);
    });
  });
});
