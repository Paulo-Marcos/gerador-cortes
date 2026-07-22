import { describe, expect, it } from 'vitest';
import type { Projeto } from '@/types/models';
import { estadoDoProjeto } from '../statusMaps';

function makeProjeto(patch: Partial<Projeto> = {}): Projeto {
  return {
    id: 'p1',
    youtube_url: 'https://youtu.be/abc',
    titulo_live: 'Live de teste',
    canal_origem: '@canal',
    data_live: '20260701',
    duracao_segundos: 3600,
    status: 'analisado',
    progresso_download: 100,
    arquivos_limpos: false,
    pontuacao_ranking: 0,
    total_cortes: 0,
    total_aprovados: 0,
    total_publicados: 0,
    total_com_meta: 0,
    total_video_pronto: 0,
    ...patch,
  } as Projeto;
}

describe('estadoDoProjeto', () => {
  it('mostra erro acima de qualquer outro sinal', () => {
    const estado = estadoDoProjeto(makeProjeto({ status: 'erro', total_cortes: 3 }));
    expect(estado.key).toBe('erro');
  });

  it('mostra publicado quando todos os cortes foram publicados', () => {
    const estado = estadoDoProjeto(makeProjeto({ total_cortes: 4, total_publicados: 4 }));
    expect(estado.key).toBe('publicado');
    expect(estado.label).toBe('publicado');
  });

  it('mostra publicando na publicacao parcial', () => {
    const estado = estadoDoProjeto(
      makeProjeto({ total_cortes: 4, total_aprovados: 4, total_publicados: 2 }),
    );
    expect(estado.key).toBe('publicando');
  });

  it('acompanha a ingestao antes da analise', () => {
    expect(estadoDoProjeto(makeProjeto({ status: 'pendente' })).key).toBe('aguardando');
    expect(estadoDoProjeto(makeProjeto({ status: 'baixando' })).key).toBe('baixando');
    expect(estadoDoProjeto(makeProjeto({ status: 'transcrevendo' })).key).toBe('transcrevendo');
    expect(estadoDoProjeto(makeProjeto({ status: 'pronto' })).key).toBe('analise');
    expect(estadoDoProjeto(makeProjeto({ status: 'analisando' })).key).toBe('analise');
  });

  it('mostra analisado enquanto nenhum corte foi aprovado', () => {
    const estado = estadoDoProjeto(makeProjeto({ total_cortes: 6, total_aprovados: 0 }));
    expect(estado.key).toBe('analisado');
  });

  it('mostra em edicao quando falta render ou metadados dos aprovados', () => {
    const semRender = estadoDoProjeto(
      makeProjeto({
        total_cortes: 6,
        total_aprovados: 3,
        total_com_meta: 3,
        total_video_pronto: 1,
      }),
    );
    expect(semRender.key).toBe('editando');

    const semMeta = estadoDoProjeto(
      makeProjeto({
        total_cortes: 6,
        total_aprovados: 3,
        total_com_meta: 0,
        total_video_pronto: 3,
      }),
    );
    expect(semMeta.key).toBe('editando');
  });

  it('mostra pronto p/ publicar quando render e metadados cobrem os aprovados', () => {
    const estado = estadoDoProjeto(
      makeProjeto({
        total_cortes: 6,
        total_aprovados: 3,
        total_com_meta: 3,
        total_video_pronto: 3,
      }),
    );
    expect(estado.key).toBe('pronto-publicar');
    expect(estado.label).toBe('pronto p/ publicar');
  });
});
