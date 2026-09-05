import { describe, expect, it } from 'vitest';
import { nomeParaTipo, primeiroTipoDeImagem } from '../imagemDaAreaDeTransferencia';

// D-530: colar a arte da capa do TikTok por botao.
//
// O que precisa de guarda e a ESCOLHA do tipo: um mesmo print costuma vir no
// clipboard como PNG e JPEG ao mesmo tempo, e a extensao do arquivo decide como
// o backend grava a arte.

describe('primeiroTipoDeImagem', () => {
  it('prefere PNG quando o clipboard traz os dois', () => {
    expect(primeiroTipoDeImagem(['image/jpeg', 'image/png'])).toBe('image/png');
  });

  it('aceita JPEG quando so ele veio', () => {
    expect(primeiroTipoDeImagem(['image/jpeg'])).toBe('image/jpeg');
  });

  it('ignora texto — copiar o prompt nao vira imagem', () => {
    expect(primeiroTipoDeImagem(['text/plain', 'text/html'])).toBeNull();
  });

  it('clipboard vazio nao quebra', () => {
    expect(primeiroTipoDeImagem([])).toBeNull();
  });
});

describe('nomeParaTipo', () => {
  it('jpeg vira .jpg', () => {
    expect(nomeParaTipo('image/jpeg')).toBe('colado.jpg');
  });

  it('png mantem a extensao', () => {
    expect(nomeParaTipo('image/png')).toBe('colado.png');
  });

  it('tipo estranho cai em png', () => {
    expect(nomeParaTipo('imagem')).toBe('colado.png');
  });
});
