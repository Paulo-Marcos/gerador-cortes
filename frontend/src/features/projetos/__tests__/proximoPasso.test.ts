import { describe, expect, it } from 'vitest';
import { liveDoDestaque, proximoPasso } from '../proximoPasso';
import { projeto } from './fixtures/projetoDaSala';

// D-1148 (H-15; DIRECAO §7.1): a primária do "Continue" é o próximo passo da live
// em que o operador mexeu por último.

describe('liveDoDestaque', () => {
  const antiga = projeto({ id: 'a', data_live: '20261101', total_cortes: 4 });
  const nova = projeto({ id: 'b', data_live: '20261119', total_cortes: 4 });
  const noAr = projeto({ id: 'c', data_live: '20261120', total_cortes: 2, total_publicados: 2 });

  it('é a última live do histórico da casca, mesmo que não seja a mais nova', () => {
    const lugares = [{ to: '/shorts' }, { to: '/projetos/a/cortes' }, { to: '/projetos/b' }];
    expect(liveDoDestaque([antiga, nova, noAr], lugares)?.id).toBe('a');
  });

  it('pula a live que já está toda no ar: ela não pede nada', () => {
    expect(liveDoDestaque([antiga, nova, noAr], [{ to: '/projetos/c' }, { to: '/projetos/a' }])?.id).toBe('a');
  });

  it('sem histórico, é a mais recente das que não foram publicadas', () => {
    expect(liveDoDestaque([antiga, nova, noAr], [])?.id).toBe('b');
  });

  it('com todas no ar, é a mais recente; sem lives, não há destaque', () => {
    expect(liveDoDestaque([noAr], [])?.id).toBe('c');
    expect(liveDoDestaque([], [{ to: '/projetos/a' }])).toBeUndefined();
  });
});

describe('proximoPasso', () => {
  it.each([
    ['erro', projeto({ status: 'erro' }), 'Ver o que falhou', '/projetos/p1'],
    ['baixando', projeto({ status: 'baixando' }), 'Acompanhar o download', '/projetos/p1'],
    ['transcrevendo', projeto({ status: 'transcrevendo' }), 'Acompanhar a transcrição', '/projetos/p1'],
    ['analisando', projeto({ status: 'analisando' }), 'Acompanhar a análise', '/projetos/p1'],
    ['sem cortes', projeto(), 'Propor os cortes', '/projetos/p1/cortes'],
    ['propostos', projeto({ total_cortes: 6 }), 'Revisar 6 cortes', '/projetos/p1/cortes'],
    [
      'aprovados sem render',
      projeto({ total_cortes: 6, total_aprovados: 4, total_video_pronto: 1 }),
      'Renderizar 3 cortes',
      '/projetos/p1/post-production',
    ],
    [
      'sem metadados',
      projeto({ total_cortes: 6, total_aprovados: 4, total_video_pronto: 4, total_com_meta: 3 }),
      'Escrever os metadados de 1 corte',
      '/projetos/p1/metadados',
    ],
    [
      'pronta para publicar',
      projeto({ total_cortes: 6, total_aprovados: 6, total_video_pronto: 6, total_com_meta: 6 }),
      'Publicar 6 cortes',
      '/projetos/p1/final-review',
    ],
    [
      'tudo no ar',
      projeto({ total_cortes: 2, total_aprovados: 2, total_video_pronto: 2, total_com_meta: 2, total_publicados: 2 }),
      'Ver os cortes no ar',
      '/projetos/p1/cortes',
    ],
  ])('%s → "%s"', (_, p, texto, to) => {
    expect(proximoPasso(p)).toEqual({ texto, to });
  });
});
