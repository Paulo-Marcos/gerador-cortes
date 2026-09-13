import { describe, expect, it } from 'vitest';
import {
  alvoEditavel,
  imagemDoColar,
  nomeParaTipo,
  primeiroTipoDeImagem,
  type ItemColado,
} from '../imagemDaAreaDeTransferencia';

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

// D-586: Ctrl+V no modal da capa do short.

const item = (kind: string, type: string, arquivo: File | null = null): ItemColado => ({
  kind,
  type,
  getAsFile: () => arquivo,
});

describe('imagemDoColar', () => {
  it('devolve a imagem colada com nome pela extensao', () => {
    const print = new File(['x'], 'image.png', { type: 'image/png' });
    const arquivo = imagemDoColar([item('file', 'image/png', print)]);
    expect(arquivo?.name).toBe('colado.png');
    expect(arquivo?.type).toBe('image/png');
  });

  it('prefere o PNG quando o navegador cola PNG e JPEG', () => {
    const jpeg = new File(['j'], 'a.jpg', { type: 'image/jpeg' });
    const png = new File(['p'], 'a.png', { type: 'image/png' });
    const arquivo = imagemDoColar([item('file', 'image/jpeg', jpeg), item('file', 'image/png', png)]);
    expect(arquivo?.type).toBe('image/png');
  });

  it('texto colado nao vira capa', () => {
    expect(imagemDoColar([item('string', 'text/plain')])).toBeNull();
  });

  it('tipo de imagem que o backend nao aceita e ignorado', () => {
    const gif = new File(['g'], 'a.gif', { type: 'image/gif' });
    expect(imagemDoColar([item('file', 'image/gif', gif)])).toBeNull();
  });
});

describe('alvoEditavel', () => {
  // Elemento de mentira: `closest` acha um campo de texto ou nao.
  const elemento = (dentroDeCampo: boolean, isContentEditable = false) =>
    ({ isContentEditable, closest: () => (dentroDeCampo ? {} : null) }) as unknown as EventTarget;

  it('colar num textarea e colar texto', () => {
    expect(alvoEditavel(elemento(true))).toBe(true);
  });

  it('colar num contenteditable e colar texto', () => {
    expect(alvoEditavel(elemento(false, true))).toBe(true);
  });

  it('colar com o foco num botao pode virar capa', () => {
    expect(alvoEditavel(elemento(false))).toBe(false);
  });

  it('foco no document (sem closest) pode virar capa', () => {
    expect(alvoEditavel({} as EventTarget)).toBe(false);
  });

  it('sem alvo nao e editavel', () => {
    expect(alvoEditavel(null)).toBe(false);
  });
});
