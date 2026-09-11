import { describe, expect, it } from 'vitest';
import type { PublicacaoRegistrada, ShortSugerido } from '../shortsApi';
import {
  alternar,
  contarEnvios,
  montarAlvos,
  plataformasJaPublicadas,
  shortsPublicaveis,
} from '../selecaoDoLote';

function short(parcial: Partial<ShortSugerido>): ShortSugerido {
  return {
    id: 's1',
    corte_id: 'c1',
    numero: 1,
    titulo: 'Trecho',
    status: 'renderizado',
    arquivo_short_path: 'cortes/c1/shorts/s1/short.mp4',
    ...parcial,
  } as ShortSugerido;
}

function publicacao(parcial: Partial<PublicacaoRegistrada>): PublicacaoRegistrada {
  return {
    alvo_id: 's1',
    plataforma: 'youtube_shorts',
    estado: 'publicado',
    url: '',
    detalhe: '',
    publicado_em: '2026-09-10T20:00:00',
    ...parcial,
  };
}

describe('shortsPublicaveis', () => {
  it('exige status renderizado E arquivo em disco', () => {
    const lista = [
      short({ id: 'ok' }),
      short({ id: 'sugerido', status: 'sugerido' }),
      // O caso que o status sozinho não pega: a limpeza levou o MP4 por fora do
      // app, e oferecer este short só produziria erro depois da escolha.
      short({ id: 'sem-arquivo', arquivo_short_path: '' }),
    ];

    expect(shortsPublicaveis(lista).map((s) => s.id)).toEqual(['ok']);
  });
});

describe('plataformasJaPublicadas', () => {
  it('só conta o que foi publicado de verdade', () => {
    const registros = [
      publicacao({ plataforma: 'youtube_shorts' }),
      // Pacote montado NÃO é publicação: dizer o contrário esconderia do
      // operador exatamente o que falta subir.
      publicacao({ plataforma: 'tiktok', estado: 'sua_vez', publicado_em: '' }),
      publicacao({ alvo_id: 'outro', plataforma: 'instagram_reels' }),
    ];

    expect(plataformasJaPublicadas(registros, 's1')).toEqual(new Set(['youtube_shorts']));
  });
});

describe('contarEnvios', () => {
  it('conta pares vídeo × plataforma, descontando o que já foi', () => {
    const registros = [publicacao({ alvo_id: 's1', plataforma: 'youtube_shorts' })];

    // s1 só falta no tiktok; s2 falta nos dois.
    expect(contarEnvios(['s1', 's2'], ['youtube_shorts', 'tiktok'], registros)).toBe(3);
  });

  it('é zero quando não há plataforma marcada', () => {
    expect(contarEnvios(['s1'], [], [])).toBe(0);
  });
});

describe('montarAlvos', () => {
  it('prefixa com o tipo, que é como o backend sabe qual arquivo pegar', () => {
    expect(montarAlvos(['a', 'b'])).toEqual(['short:a', 'short:b']);
  });
});

describe('alternar', () => {
  it('liga e desliga sem mutar a lista anterior', () => {
    const inicial = ['a'];
    const comB = alternar(inicial, 'b');

    expect(comB).toEqual(['a', 'b']);
    expect(alternar(comB, 'a')).toEqual(['b']);
    expect(inicial).toEqual(['a']);
  });
});
