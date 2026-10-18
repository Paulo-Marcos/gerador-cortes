import { describe, expect, it } from 'vitest';
import { padraoComPosicionamento } from '../youtubeLayoutPadrao';
import { modoDoGlobal } from '@/features/channels/PadraoDoCanalModais';
import { DEFAULT_YOUTUBE_LAYOUT, sharedConfigFromFull } from '@/shared/palco/youtubeLayout';

// D-966 (reauditoria do PR #234): "Definir posicionamento" num escopo de padrão
// (Projeto/Global) nunca decide o modo — gravar o modo herdado pregaria o do
// Global no projeto (RN-10). E a tela de Canais lê o modo do Global como a
// cascata o lê: sem modo gravado, o padrão do app (FULL).

const COMP = DEFAULT_YOUTUBE_LAYOUT.compartilhada;

describe('definir posicionamento não decide o modo (D-966)', () => {
  it('num escopo que herda o modo, o JSON segue sem modo', () => {
    const json = JSON.parse(padraoComPosicionamento('{}', 'compartilhada', COMP));

    expect(json).not.toHaveProperty('modo_padrao');
    expect(json.compartilhada).toEqual(COMP);
  });

  it('num escopo com modo próprio, o modo fica como estava', () => {
    const salvo = JSON.stringify({ modo_padrao: 'compartilhada' });
    const full = sharedConfigFromFull(DEFAULT_YOUTUBE_LAYOUT.full);

    const json = JSON.parse(padraoComPosicionamento(salvo, 'full', full));

    expect(json.modo_padrao).toBe('compartilhada');
    expect(json.full).toEqual(DEFAULT_YOUTUBE_LAYOUT.full);
  });

  it('leva fundo e placa quando vêm do modal', () => {
    const json = JSON.parse(
      padraoComPosicionamento(undefined, 'compartilhada', COMP, { fundo: 'cosmograph' }),
    );

    expect(json.fundo).toBe('cosmograph');
  });
});

describe('modo do padrão do canal (D-966)', () => {
  it('Global sem modo gravado é FULL, como na cascata', () => {
    expect(modoDoGlobal(JSON.stringify({ compartilhada: COMP }))).toBe('full');
    expect(modoDoGlobal('{}')).toBe('full');
  });

  it('Global com modo gravado usa o dele', () => {
    expect(modoDoGlobal(JSON.stringify({ modo_padrao: 'compartilhada' }))).toBe('compartilhada');
  });
});
