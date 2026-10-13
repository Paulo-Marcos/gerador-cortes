import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MARCA_DO_DESTAQUE, partesDoGancho, semMarcas } from '@video-renderer/public-api';
import { GanchoPrevia } from '../GanchoPrevia';

// D-913: o trecho entre asteriscos sai no acento — na prévia e no render, pela
// mesma função; o backend tira as marcas onde o gancho aparece sem cor.

const DESTAQUE_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/domain/short/destaque_do_gancho.py',
);

describe('destaque do gancho (D-913)', () => {
  it('parte o texto no primeiro par de marcas', () => {
    expect(partesDoGancho('Nietzsche não pedia *Game of Thrones*')).toEqual({
      antes: 'Nietzsche não pedia ',
      destaque: 'Game of Thrones',
      depois: '',
    });
  });

  it('sem par válido não há destaque, e as marcas somem', () => {
    expect(partesDoGancho('sem marca')).toBeNull();
    expect(partesDoGancho('marca *solta')).toBeNull();
    expect(partesDoGancho('par ** vazio')).toBeNull();
    expect(semMarcas('marca *solta')).toBe('marca solta');
  });

  it('usa a mesma marca do backend', () => {
    const fonte = readFileSync(DESTAQUE_DO_BACKEND, 'utf-8');
    expect(fonte).toContain(`MARCA = "${MARCA_DO_DESTAQUE}"`);
  });

  it('a prévia pinta só o trecho marcado, no acento', () => {
    const html = renderToStaticMarkup(
      <GanchoPrevia
        texto="Nietzsche não pedia *Game of Thrones*"
        ateSeg={3}
        inicioSeg={0}
        fimSeg={30}
        tempoAtualSeg={1}
      />,
    );
    expect(html).toContain('<span style="color:var(--wb-accent)">Game of Thrones</span>');
    expect(html).not.toContain('*');
  });
});
