import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  cortePorPlataforma,
  escreverPostSeFaltar,
  hashtagsDoTexto,
  MAX_HASHTAGS,
  parteEscondida,
  parteVisivel,
  recadoDoTitulo,
  textoDasHashtags,
  TITULO_MAX,
  TITULO_VISIVEL,
  tomDoTitulo,
} from '../postDoShort';

const PUBLICACAO = resolve(__dirname, '../../../../../backend/app/domain/publicacao/publicacao.py');
const METADADOS = resolve(__dirname, '../../../../../backend/app/domain/short/metadados_short.py');

// A tela só pode prometer o espaço que a plataforma dá. Como os projetos não
// compartilham módulo, os números são cópias — e é este bloco que impede que o
// backend mude um limite e a tela siga contando pelo antigo.
describe('acordo com o backend', () => {
  it('os limites do YouTube Shorts são os mesmos dos dois lados', () => {
    const fonte = readFileSync(PUBLICACAO, 'utf-8');
    // `\n\s*\)` e não `\),\n`: o arquivo vem com CRLF, e casar o fim de linha
    // literal falharia em silêncio — o teste passaria a não testar nada.
    const bloco = /YOUTUBE_SHORTS: LimitesPlataforma\(([\s\S]*?)\n\s*\),/.exec(fonte)?.[1];

    expect(bloco, 'o bloco YOUTUBE_SHORTS sumiu de publicacao.py').toBeTruthy();
    expect(Number(/titulo_visivel=(\d+)/.exec(bloco ?? '')?.[1])).toBe(TITULO_VISIVEL);
    expect(Number(/titulo_max=(\d+)/.exec(bloco ?? '')?.[1])).toBe(TITULO_MAX);
  });

  it('o teto de hashtags é o mesmo do domínio', () => {
    const fonte = readFileSync(METADADOS, 'utf-8');
    const encontrado = /^MAX_HASHTAGS\s*=\s*(\d+)/m.exec(fonte);

    expect(encontrado, 'MAX_HASHTAGS sumiu do domínio').not.toBeNull();
    expect(Number(encontrado?.[1])).toBe(MAX_HASHTAGS);
  });
});

describe('tomDoTitulo', () => {
  it('sem texto é vazio — a publicação cai no título da curadoria', () => {
    expect(tomDoTitulo('')).toBe('vazio');
    expect(tomDoTitulo('   ')).toBe('vazio');
  });

  it('até o limite visível, cabe inteiro', () => {
    expect(tomDoTitulo('x'.repeat(TITULO_VISIVEL))).toBe('cabe');
  });

  it('acima do limite visível, corta — mas continua salvável', () => {
    expect(tomDoTitulo('x'.repeat(TITULO_VISIVEL + 1))).toBe('corta');
  });

  it('todo tom tem um recado escrito', () => {
    for (const tom of ['vazio', 'cabe', 'corta'] as const) {
      expect(recadoDoTitulo(tom).length).toBeGreaterThan(0);
    }
  });
});

describe('partes do título', () => {
  it('o que cabe e o que some se complementam', () => {
    const titulo = 'x'.repeat(60);
    expect(parteVisivel(titulo) + parteEscondida(titulo)).toBe(titulo);
    expect(parteVisivel(titulo)).toHaveLength(TITULO_VISIVEL);
  });

  it('título curto não tem parte escondida', () => {
    expect(parteEscondida('curto')).toBe('');
  });
});

describe('cortePorPlataforma', () => {
  it('mostra onde cada plataforma para', () => {
    expect(cortePorPlataforma(6)).toEqual([
      { plataforma: 'YouTube Shorts', usa: 3 },
      { plataforma: 'TikTok', usa: 5 },
      { plataforma: 'Instagram Reels', usa: 6 },
    ]);
  });

  it('escrever poucas não inventa hashtag que não existe', () => {
    expect(cortePorPlataforma(2).every((p) => p.usa === 2)).toBe(true);
  });
});

describe('hashtagsDoTexto', () => {
  it('tira o cerquilha que o operador digita por hábito', () => {
    expect(hashtagsDoTexto('#juros #selic')).toEqual(['juros', 'selic']);
  });

  it('separa por vírgula também', () => {
    expect(hashtagsDoTexto('juros, selic')).toEqual(['juros', 'selic']);
  });

  it('repetida entra uma vez só', () => {
    expect(hashtagsDoTexto('juros JUROS #juros')).toEqual(['juros']);
  });

  it('preserva acento e número', () => {
    expect(hashtagsDoTexto('inflação selic15')).toEqual(['inflação', 'selic15']);
  });

  it('para no teto', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(' ');
    expect(hashtagsDoTexto(muitas)).toHaveLength(MAX_HASHTAGS);
  });

  it('texto vazio não vira hashtag nenhuma', () => {
    expect(hashtagsDoTexto('   ')).toEqual([]);
  });

  it('ida e volta pelo campo preserva os termos', () => {
    const tags = ['juros', 'selic'];
    expect(hashtagsDoTexto(textoDasHashtags(tags))).toEqual(tags);
  });
});

describe('escreverPostSeFaltar', () => {
  it('sem post gerado, o Finalizar manda a IA escrever', async () => {
    const escrever = vi.fn();
    await escreverPostSeFaltar(async () => ({ gerado: false }), escrever);
    expect(escrever).toHaveBeenCalledOnce();
  });

  it('post já gerado não é reescrito — pode ter sido revisado', async () => {
    const escrever = vi.fn();
    await escreverPostSeFaltar(async () => ({ gerado: true }), escrever);
    expect(escrever).not.toHaveBeenCalled();
  });

  it('sem conseguir ler o post, não arrisca escrever por cima', async () => {
    const escrever = vi.fn();
    await escreverPostSeFaltar(() => Promise.reject(new Error('offline')), escrever);
    expect(escrever).not.toHaveBeenCalled();
  });
});
