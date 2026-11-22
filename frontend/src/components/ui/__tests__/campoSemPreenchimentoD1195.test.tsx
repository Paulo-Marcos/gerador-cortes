import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Busca } from '../busca';
import { Input } from '../input';
import { Textarea } from '../textarea';

// D-1195 (E-069 H-25; DIRECAO §8.2 Formulário): "`autocomplete="off"`; `spellCheck={false}`
// em URL e handle". A auditoria mediu os campos de Metadados, Shorts, Atalhos e da paleta sem
// `autocomplete`: o Chrome oferecia o que o operador digitou em outro site por cima do campo.
// O padrão mora nos primitivos; quem precisa do preenchimento passa o seu.

const noop = () => {};

describe('campos sem o preenchimento do navegador', () => {
  it.each([
    ['Input atual', <Input key="a" />],
    ['Input sala', <Input key="b" aparencia="sala" />],
    ['Busca', <Busca key="c" value="" aoMudar={noop} aria-label="Buscar" />],
    ['Textarea', <Textarea key="d" />],
  ])('%s nasce com autocomplete="off"', (_nome, campo) => {
    expect(renderToStaticMarkup(campo)).toMatch(/autocomplete="off"/i);
  });

  it('quem precisa do preenchimento passa o seu', () => {
    expect(renderToStaticMarkup(<Input aparencia="sala" autoComplete="email" />)).toMatch(/autocomplete="email"/i);
  });

  it('URL não passa pelo corretor', () => {
    expect(renderToStaticMarkup(<Input type="url" />)).toMatch(/spellcheck="false"/i);
    expect(renderToStaticMarkup(<Input aparencia="sala" type="url" />)).toMatch(/spellcheck="false"/i);
    expect(renderToStaticMarkup(<Input />)).not.toMatch(/spellcheck/i);
  });
});
