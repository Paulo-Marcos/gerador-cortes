import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TrilhaDeEtapas } from '../TrilhaDeEtapas';
import { trilhaDaLive, type DadosDaLive } from '../trilhaDaLive';

// D-866: a trilha desenhada — sete casas que navegam e mostram progresso — e
// o lugar dela: a casca, no lugar da fita de cinco fases.

const LIVE: DadosDaLive = {
  statusDoProjeto: 'analisado',
  arquivosLimpos: false,
  cortes: [
    { id: 'a', status: 'aprovado' },
    { id: 'b', status: 'proposto' },
  ],
  exportados: [],
};

function desenhar(etapas = trilhaDaLive('pos', '267', '7', LIVE)) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TrilhaDeEtapas etapas={etapas} />
    </MemoryRouter>,
  );
}

const fonte = (caminho: string) => readFileSync(resolve(__dirname, caminho), 'utf8');

describe('TrilhaDeEtapas', () => {
  it('cada etapa é um link para o seu destino, com nome e contagem', () => {
    const html = desenhar();
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
    expect(links.map((l) => l[1])).toEqual([
      '/projetos/267',
      '/projetos/267',
      '/projetos/267/cortes/7',
      '/projetos/267/post-production?corte=7',
      '/projetos/267/metadados?corte=7',
      '/projetos/267/final-review?corte=7',
      '/projetos/267?filtro=no-ar',
    ]);
    expect(links[2][2]).toContain('Cortes');
    expect(links[2][2]).toContain('1 de 2');
  });

  it('marca a etapa acesa como o passo atual, e só ela', () => {
    const html = desenhar();
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<\/a>).)*Pós/);
  });

  it('etapa feita leva o ✓; a que falta, o seu número', () => {
    const casas = [...desenhar().matchAll(/<a [^>]*>(.*?)<\/a>/g)].map((m) => m[1]);
    // Baixado e Analisado estão feitos: o marcador é o ícone, não o número.
    expect(casas[0]).toContain('<svg');
    expect(casas[0]).not.toMatch(/>1</);
    // Metadados (5ª casa) não está feito: mostra o número.
    expect(casas[4]).toMatch(/>5</);
  });

  it('fora de uma live não desenha nada', () => {
    expect(desenhar([])).toBe('');
  });

  it('a casca desenha a trilha no lugar da fita de cinco fases', () => {
    const casca = fonte('../UpgradeShell.tsx');
    expect(casca).toContain('<TrilhaDeEtapas etapas={etapasDaLive} />');
    expect(casca).not.toContain('FitaDaLive');
    expect(() => fonte('../FitaDaLive.tsx')).toThrow();
  });
});

describe('TrilhaDeEtapas · leitor de tela', () => {
  it('cada casa diz o nome, a contagem e, se for o caso, que está concluída', () => {
    const html = desenhar();
    expect(html).toContain('aria-label="Baixado: ok, concluída"');
    expect(html).toContain('aria-label="Metadados: 0 de 1"');
  });
});
