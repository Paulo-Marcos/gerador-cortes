import { describe, expect, it } from 'vitest';
import { GLOBAL_TABS, routeToTab, rotuloCurtoProjeto, tabPath } from '../workbenchRoutes';
import type { ProjetoTab, WorkbenchEtapa } from '../useWorkbenchTabs';

const aba = (etapa: WorkbenchEtapa, corteId?: string): ProjetoTab =>
  corteId === undefined
    ? { kind: 'projeto', projetoId: 'p1', etapa }
    : { kind: 'projeto', projetoId: 'p1', etapa, corteId };

describe('tabPath ↔ routeToTab (rotas mantidas 1:1)', () => {
  it('mapeia cada etapa para a rota atual do routes.tsx', () => {
    expect(tabPath(aba('workspace'))).toBe('/projetos/p1');
    expect(tabPath(aba('cortes'))).toBe('/projetos/p1/cortes');
    expect(tabPath(aba('cortes', 'c9'))).toBe('/projetos/p1/cortes/c9');
    expect(tabPath(aba('pos'))).toBe('/projetos/p1/post-production');
    expect(tabPath(aba('metadados'))).toBe('/projetos/p1/metadados');
    expect(tabPath(aba('revisao'))).toBe('/projetos/p1/final-review');
  });

  it('a aba amarrada a um corte carrega o corte em todas as etapas (D-427)', () => {
    expect(tabPath(aba('workspace', 'c9'))).toBe('/projetos/p1?corte=c9');
    expect(tabPath(aba('pos', 'c9'))).toBe('/projetos/p1/post-production?corte=c9');
    expect(tabPath(aba('metadados', 'c9'))).toBe('/projetos/p1/metadados?corte=c9');
    expect(tabPath(aba('revisao', 'c9'))).toBe('/projetos/p1/final-review?corte=c9');
  });

  it('routeToTab inverte tabPath para todas as etapas, com e sem corte', () => {
    const etapas = ['workspace', 'cortes', 'pos', 'metadados', 'revisao'] as const;
    for (const etapa of etapas) {
      for (const corteId of [undefined, 'c9']) {
        const tab = aba(etapa, corteId);
        const url = new URL(tabPath(tab), 'http://x');
        expect(routeToTab(url.pathname, url.search)).toEqual(tab);
      }
    }
  });

  it('a rota /export também abre a etapa pos (deep-link do step 4)', () => {
    expect(routeToTab('/projetos/p1/export')).toEqual({
      kind: 'projeto',
      projetoId: 'p1',
      etapa: 'pos',
    });
  });

  it('cada tela global vira a sua aba', () => {
    for (const info of GLOBAL_TABS) {
      expect(routeToTab(info.path)).toEqual({ kind: 'global', global: info.id });
      expect(tabPath({ kind: 'global', global: info.id })).toBe(info.path);
    }
  });

  it('rota desconhecida não vira aba', () => {
    expect(routeToTab('/')).toBeNull();
    expect(routeToTab('/nao-existe')).toBeNull();
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
