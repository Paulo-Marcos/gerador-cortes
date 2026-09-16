import { describe, expect, it } from 'vitest';
import type { ShortPronto } from '../shortsApi';
import {
  contarPorFiltro,
  filtrarProntos,
  origemDoPronto,
  paraOLote,
  publicacoesDosProntos,
  redesQueFaltam,
} from '../centralProntos';
import { contarEnvios, plataformasJaPublicadas } from '../selecaoDoLote';

function pronto(parcial: Partial<ShortPronto>): ShortPronto {
  return {
    id: 's1',
    corte_id: 'c1',
    numero: 1,
    titulo: 'Trecho',
    status: 'renderizado',
    arquivo_short_path: 'cortes/c1/shorts/s1/short.mp4',
    inicio_seg: 0,
    duracao_seg: 30,
    corte_numero: 7,
    corte_titulo: 'O corte',
    projeto_id: 'p1',
    projeto_titulo: 'LIVE 267',
    publicadas: [],
    pendentes: ['youtube_shorts', 'tiktok', 'instagram_reels'],
    post: { gerado: false, titulo: '', hashtags: 0 },
    capa: { tem_capa: false, instante_seg: 0 },
    atualizado_em: '',
    ...parcial,
  };
}

const semNada = pronto({ id: 'a' });
const soFaltaInstagram = pronto({
  id: 'b',
  corte_id: 'c2',
  publicadas: ['youtube_shorts', 'tiktok'],
  pendentes: ['instagram_reels'],
  post: { gerado: true, titulo: 'Post', hashtags: 3 },
  capa: { tem_capa: true, instante_seg: 2 },
});

describe('filtrarProntos', () => {
  it('filtra pelo que falta: rede, post e capa', () => {
    const todos = [semNada, soFaltaInstagram];
    expect(filtrarProntos(todos, 'todos')).toHaveLength(2);
    expect(filtrarProntos(todos, 'tiktok').map((p) => p.id)).toEqual(['a']);
    expect(filtrarProntos(todos, 'instagram_reels')).toHaveLength(2);
    expect(filtrarProntos(todos, 'sem_post').map((p) => p.id)).toEqual(['a']);
    expect(filtrarProntos(todos, 'sem_capa').map((p) => p.id)).toEqual(['a']);
  });

  it('conta cada filtro para o chip', () => {
    expect(contarPorFiltro([semNada, soFaltaInstagram])).toEqual({
      todos: 2,
      sem_post: 1,
      sem_capa: 1,
      youtube_shorts: 1,
      tiktok: 1,
      instagram_reels: 2,
    });
  });
});

describe('ponte com o lote', () => {
  it('reconstrói o histórico que faz o lote pular o que já subiu', () => {
    const registradas = publicacoesDosProntos([semNada, soFaltaInstagram]);
    expect(plataformasJaPublicadas(registradas, 'b')).toEqual(new Set(['youtube_shorts', 'tiktok']));
    // b em 3 redes, mas 2 já foram: só 1 envio de verdade — somado aos 3 de a.
    expect(
      contarEnvios(['a', 'b'], ['youtube_shorts', 'tiktok', 'instagram_reels'], registradas),
    ).toBe(4);
  });

  it('abre o lote só com as redes que faltam nos escolhidos', () => {
    const todos = [semNada, soFaltaInstagram];
    expect(redesQueFaltam(todos, ['b'])).toEqual(['instagram_reels']);
    expect(redesQueFaltam(todos, ['a', 'b'])).toEqual(['youtube_shorts', 'tiktok', 'instagram_reels']);
  });

  it('leva o corte de origem, porque a lista mistura cortes', () => {
    expect(origemDoPronto(semNada)).toBe('Corte #7 · LIVE 267');
    expect(paraOLote([semNada])[0].origem).toBe('Corte #7 · LIVE 267');
  });
});
