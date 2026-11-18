import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Busca } from '@/components/ui/busca';
import { CartaoDeOpcao } from '@/components/ui/cartao-de-opcao';
import { GrupoDeRadio } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';

// D-1119 (achado da auditoria): a pílula da ação de IA desenha o foco em anel
// (`ring-foco`), sem `outline-foco`, e escapava da exceção da casca. O teste principal
// cobre os demais controles; este cobre os que ele não listava.

const css = readFileSync(resolve(__dirname, '../upgrade.css'), 'utf-8');
const MARCADOR = /outline-foco|ring-foco|rounded-campo/;

describe('D-1119: a casca também reconhece a ação de IA, a busca, a seleção e o cartão', () => {
  it('a exceção da casca inclui `[data-sala]` na fonte e no foco', () => {
    const regras = css.match(/^\.ap (button|:focus-visible):where\(:not\(.*\)\)/gm) ?? [];
    expect(regras).toHaveLength(2);
    for (const r of regras) expect(r).toContain('[data-sala]');
  });

  it.each([
    ['AcaoDeIa da Sala', <AcaoDeIa rotulo="Gerar" emVoo={null} onGerar={() => {}} aparencia="sala-escura" />],
    ['Busca', <Busca value="" aoMudar={() => {}} aria-label="busca" />],
    ['Select', <Select opcoes={[{ valor: 'a', rotulo: 'A' }]} value="a" aria-label="seleção" />],
    [
      'CartaoDeOpcao',
      <GrupoDeRadio value="a" onValueChange={() => {}} aria-label="grupo">
        <CartaoDeOpcao value="a" titulo="Opção" />
      </GrupoDeRadio>,
    ],
  ])('%s: todo botão ou campo carrega o marcador', (_nome, arvore) => {
    const controles = [...renderToStaticMarkup(arvore).matchAll(/<(button|input|textarea)\s[^>]*?\bclass="([^"]*)"/g)];
    expect(controles.length).toBeGreaterThan(0);
    for (const m of controles) expect(m[2], `<${m[1]}> perdeu o marcador`).toMatch(MARCADOR);
  });

  it('a pílula antiga da ação de IA não leva o marcador', () => {
    const html = renderToStaticMarkup(<AcaoDeIa rotulo="Gerar" emVoo={null} onGerar={() => {}} />);
    expect(html).not.toMatch(MARCADOR);
  });
});
