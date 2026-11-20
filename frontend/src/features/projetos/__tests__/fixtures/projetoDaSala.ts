import type { Corte, Projeto } from '@/types/models';

// D-1148 · Projeto e corte mínimos para os testes da Biblioteca da sala.
export function projeto(patch: Partial<Projeto> = {}): Projeto {
  return {
    id: 'p1',
    youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    titulo_live: 'Live de teste',
    canal_origem: '@canal',
    data_live: '20261120',
    criado_em: '2026-11-20T10:00:00',
    duracao_segundos: 7200,
    status: 'analisado',
    progresso_download: 100,
    arquivos_limpos: false,
    rebaixando_video: false,
    fires_pendentes: 0,
    pontuacao_ranking: 0,
    redes_do_horizontal: [],
    total_cortes: 0,
    total_aprovados: 0,
    total_publicados: 0,
    total_com_meta: 0,
    total_video_pronto: 0,
    ...patch,
  } as Projeto;
}

export function corte(patch: Partial<Corte> = {}): Corte {
  return {
    id: 'c1',
    numero: 1,
    titulo_proposto: 'O erro do BC',
    tema_central: 'juros',
    inicio_seg: 600,
    fim_seg: 1200,
    status: 'proposto',
    ...patch,
  } as Corte;
}
