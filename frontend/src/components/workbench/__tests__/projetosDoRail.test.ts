import { describe, expect, it } from 'vitest';
import type { Projeto, StatusProjeto } from '@/types/models';
import { projetosDoRail } from '../ProjectRail';

function projeto(id: string, status: StatusProjeto = 'analisado'): Projeto {
  return {
    id,
    youtube_url: `https://youtu.be/${id}`,
    titulo_live: `Live ${id}`,
    canal_origem: '@canal',
    data_live: '20260701',
    duracao_segundos: 3600,
    status,
    progresso_download: 100,
    arquivos_limpos: false,
    pontuacao_ranking: 0,
    total_cortes: 0,
    total_aprovados: 0,
    total_publicados: 0,
    total_com_meta: 0,
    total_video_pronto: 0,
  } as Projeto;
}

const ids = (projetos: Projeto[]) => projetos.map((p) => p.id);

describe('projetosDoRail', () => {
  it('lista os fixados antes dos abertos e dos em processamento', () => {
    const projetos = [projeto('a'), projeto('b'), projeto('c', 'baixando')];
    const doRail = projetosDoRail({ projetos, abertosIds: ['b'], fixadosIds: ['a'] });
    expect(ids(doRail)).toEqual(['a', 'b', 'c']);
  });

  it('mantém o fixado no rail mesmo sem aba aberta nem pipeline rodando', () => {
    const doRail = projetosDoRail({
      projetos: [projeto('a'), projeto('b')],
      abertosIds: [],
      fixadosIds: ['b'],
    });
    expect(ids(doRail)).toEqual(['b']);
  });

  it('respeita a ordem de fixação', () => {
    const doRail = projetosDoRail({
      projetos: [projeto('a'), projeto('b'), projeto('c')],
      abertosIds: [],
      fixadosIds: ['c', 'a'],
    });
    expect(ids(doRail)).toEqual(['c', 'a']);
  });

  it('não duplica projeto fixado que também está aberto ou processando', () => {
    const doRail = projetosDoRail({
      projetos: [projeto('a', 'transcrevendo')],
      abertosIds: ['a'],
      fixadosIds: ['a'],
    });
    expect(ids(doRail)).toEqual(['a']);
  });

  it('ignora id fixado de projeto que não existe mais', () => {
    const doRail = projetosDoRail({
      projetos: [projeto('a')],
      abertosIds: ['a'],
      fixadosIds: ['sumiu'],
    });
    expect(ids(doRail)).toEqual(['a']);
  });

  it('corta no limite, preservando os fixados', () => {
    const projetos = [projeto('x', 'baixando'), projeto('y', 'baixando'), projeto('z')];
    const doRail = projetosDoRail({
      projetos,
      abertosIds: [],
      fixadosIds: ['z'],
      limite: 2,
    });
    expect(ids(doRail)).toEqual(['z', 'x']);
  });
});
