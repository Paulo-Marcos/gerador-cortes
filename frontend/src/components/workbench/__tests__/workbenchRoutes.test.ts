import { describe, expect, it } from 'vitest';
import { routeToTab, rotuloCurtoProjeto, tabPath } from '../workbenchRoutes';

describe('tabPath ↔ routeToTab (rotas mantidas 1:1)', () => {
  it('mapeia cada etapa para a rota atual do routes.tsx', () => {
    expect(tabPath({ projetoId: 'p1', etapa: 'workspace' })).toBe('/projetos/p1');
    expect(tabPath({ projetoId: 'p1', etapa: 'cortes' })).toBe('/projetos/p1/cortes');
    expect(tabPath({ projetoId: 'p1', etapa: 'cortes', corteId: 'c9' })).toBe(
      '/projetos/p1/cortes/c9',
    );
    expect(tabPath({ projetoId: 'p1', etapa: 'pos' })).toBe('/projetos/p1/post-production');
    expect(tabPath({ projetoId: 'p1', etapa: 'metadados' })).toBe('/projetos/p1/metadados');
    expect(tabPath({ projetoId: 'p1', etapa: 'revisao' })).toBe('/projetos/p1/final-review');
  });

  it('routeToTab inverte tabPath para todas as etapas', () => {
    const tabs = [
      { projetoId: 'p1', etapa: 'workspace' },
      { projetoId: 'p1', etapa: 'cortes' },
      { projetoId: 'p1', etapa: 'cortes', corteId: 'c9' },
      { projetoId: 'p1', etapa: 'pos' },
      { projetoId: 'p1', etapa: 'metadados' },
      { projetoId: 'p1', etapa: 'revisao' },
    ] as const;
    for (const tab of tabs) {
      expect(routeToTab(tabPath(tab))).toEqual(tab);
    }
  });

  it('a rota /export também abre a aba pos (deep-link do step 4)', () => {
    expect(routeToTab('/projetos/p1/export')).toEqual({ projetoId: 'p1', etapa: 'pos' });
  });

  it('rotas globais não viram aba', () => {
    for (const path of [
      '/projetos',
      '/buscar-lives',
      '/ranking-lives',
      '/padroes-thumbnail',
      '/canais',
      '/analises',
      '/',
    ]) {
      expect(routeToTab(path)).toBeNull();
    }
  });
});

describe('rotuloCurtoProjeto', () => {
  it('extrai o número da live do título (ignora número colado em palavra, ex.: 100k)', () => {
    expect(rotuloCurtoProjeto('LIVE 267 — Respondendo inscritos')).toBe('267');
    expect(rotuloCurtoProjeto('Especial 100k ao vivo live 265')).toBe('265');
  });

  it('sem número usa o começo do título (truncado acima de 14 chars)', () => {
    expect(rotuloCurtoProjeto('Gameplay retrô do sapo')).toBe('Gameplay ret…');
    expect(rotuloCurtoProjeto('Curta')).toBe('Curta');
  });

  it('título vazio vira "?"', () => {
    expect(rotuloCurtoProjeto(undefined)).toBe('?');
    expect(rotuloCurtoProjeto('  ')).toBe('?');
  });
});
