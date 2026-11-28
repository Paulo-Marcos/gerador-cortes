import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { diasDaRegua, tituloDaRegua } from '../regrasDaBiblioteca';
import { SalaDaBiblioteca } from '../SalaDaBiblioteca';
import { projeto } from './fixtures/projetoDaSala';

// D-1153 (DIRECAO §7.1, decisão de 28/11): a régua da Biblioteca é "as últimas 8 lives",
// uma casa por live. Com uma live por semana, a régua por dias ficava quase toda tracejada.

const HOJE = new Date(2026, 10, 28, 9);

/** Uma live por semana, da mais nova (22/11) para trás. */
const semanais = (quantas: number) =>
  Array.from({ length: quantas }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 22 - 7 * i));
    return projeto({
      id: `l${i}`,
      titulo_live: `Live ${i}`,
      data_live: d.toISOString().slice(0, 10).replaceAll('-', ''),
    });
  });

function desenhar(lives: ReturnType<typeof semanais>) {
  const nada = () => undefined;
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <SalaDaBiblioteca
            total={lives.length}
            cortesDoDestaque={[]}
            dias={diasDaRegua(lives, HOJE)}
            esperando={[]}
            noAr={[]}
            ir={nada}
            onVerTodas={nada}
          />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const casas = (html: string) =>
  [...html.matchAll(/data-dia="([^"]+)" data-tem-live="([^"]+)"/g)].map((m) => [m[1], m[2]]);

describe('régua das últimas 8 lives', () => {
  it('10 lives em semanas diferentes: 8 casas com as datas, nenhuma vazia', () => {
    const html = desenhar(semanais(10));
    expect(casas(html)).toEqual(
      [
        '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25',
        '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22',
      ].map((d) => [d, 'sim']),
    );
    expect(html).toContain('>22 nov</time>');
    expect(html).not.toContain('Sem live neste dia');
    expect(html).toContain('As últimas 8 lives');
    expect(html).not.toContain('Os últimos 8 dias');
  });

  it('3 lives: 3 casas, sem casa inventada', () => {
    const html = desenhar(semanais(3));
    expect(casas(html)).toHaveLength(3);
    expect(html).toContain('As últimas 3 lives');
  });

  it('cada casa leva a mesma informação de antes: capa, título, destino e estado', () => {
    const [casa] = diasDaRegua(
      [projeto({ id: 'a', data_live: '20261108', status: 'baixando' })],
      HOJE,
    );
    expect(casa).toEqual({
      data: '2026-11-08',
      hoje: false,
      lives: [
        {
          id: 'a',
          titulo: 'Live de teste',
          href: '/projetos/a',
          capa: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
          tom: 'curso',
          estado: 'Baixando',
        },
      ],
    });
  });

  it('duas lives no mesmo dia são duas casas; a de hoje se diz "hoje"', () => {
    const dias = diasDaRegua(
      [
        projeto({ id: 'manha', data_live: '20261128090000' }),
        projeto({ id: 'noite', data_live: '20261128210000' }),
      ],
      HOJE,
    );
    expect(dias.map((d) => d.lives.map((l) => l.id))).toEqual([['manha'], ['noite']]);
    expect(dias.every((d) => d.hoje)).toBe(true);
  });

  it('live sem data legível fica fora; sem nenhuma, a seção diz isso', () => {
    const semData = [projeto({ id: 's', data_live: '' })];
    expect(diasDaRegua(semData, HOJE)).toEqual([]);
    const html = desenhar(semData);
    expect(casas(html)).toEqual([]);
    expect(html).toContain('Nenhuma live com data ainda.');
  });

  // Com as 8 casas cheias, a capa ao lado do título não deixava largura para ele: a 1100 px
  // de janela o título sumia inteiro. A capa vai em cima, na largura da casa.
  it('o título tem a largura da casa: a capa vai em cima dele, não ao lado', () => {
    const html = desenhar(semanais(8));
    const links = [...html.matchAll(/<a [^>]*href="\/projetos\/[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(8);
    for (const a of links) expect(a).toMatch(/flex-col/);
    for (const [img] of html.matchAll(/<img [^>]*>/g)) expect(img).toContain('aspect-video w-full');
  });

  it('o título conta o que a régua mostra', () => {
    expect(tituloDaRegua(8)).toBe('As últimas 8 lives');
    expect(tituloDaRegua(1)).toBe('A última live');
    expect(tituloDaRegua(0)).toBe('As últimas lives');
  });
});
