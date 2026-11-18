import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Aurora } from '../aurora';
import { AvatarDoCanal, iniciaisDoCanal } from '../avatar-do-canal';
import { luzDoCanal } from '@/lib/luzDoCanal';

// D-1127 (E-069 H-11c): README `Aurora` — sem capa só halos, opacidade travada, nenhum filter
// animado — e o avatar com as variáveis no próprio elemento.
const fonte = (n: string) => readFileSync(resolve(__dirname, '..', `${n}.tsx`), 'utf8');

describe('Aurora', () => {
  it('sem capa mostra só os dois halos e nenhuma imagem', () => {
    const h = renderToStaticMarkup(<Aurora />);
    expect(h).toContain('data-aurora="halos"');
    expect(h).not.toContain('<img');
    expect(h.match(/blur-\[80px\]/g)).toHaveLength(2);
  });

  it('com capa traz a imagem escondida até carregar, decorativa', () => {
    const h = renderToStaticMarkup(<Aurora src="blob:capa" />);
    expect(h).toContain('data-aurora="capa"');
    expect(h).toMatch(/<img[^>]*src="blob:capa"[^>]*alt=""/);
    expect(h).toContain('opacity-0');
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain('pointer-events-none');
  });

  it('a opacidade vem do token e não é prop', () => {
    expect(fonte('aurora')).toContain('var(--cc-aurora-forca)');
    // @ts-expect-error — não existe prop de opacidade
    renderToStaticMarkup(<Aurora opacidade={1} />);
  });

  it('só `opacity` transiciona; filter nunca anima', () => {
    const f = fonte('aurora');
    expect(f).toContain('transition-opacity duration-200');
    expect(f).not.toMatch(/transition-(all|filter)|animate-|transition-\[/);
    expect(f).not.toContain('backdrop-');
  });
});

describe('AvatarDoCanal', () => {
  it('as variáveis da luz vão no elemento do avatar, não no :root', () => {
    const luz = luzDoCanal({ paleta: { secundaria: '#7a2fd0', acento: '#e0457b' } }, 'escuro');
    const h = renderToStaticMarkup(<AvatarDoCanal nome="Canal" luz={luz} />);
    expect(h).toMatch(/<span[^>]*style="[^"]*--luz-a:oklch[^"]*--luz-b:oklch/);
    expect(h).toContain('data-luz="canal"');
    expect(fonte('avatar-do-canal')).not.toMatch(/documentElement|:root/);
  });

  it('sem luz o anel é o neutro cc-vidro-3 e não define cor nenhuma', () => {
    const h = renderToStaticMarkup(<AvatarDoCanal nome="Canal" luz={null} />);
    expect(h).toContain('data-luz="neutra"');
    expect(h).toContain('bg-vidro-3');
    expect(h).not.toContain('--luz-a');
  });

  it('sem imagem mostra as iniciais; com imagem, a imagem', () => {
    expect(renderToStaticMarkup(<AvatarDoCanal nome="Canal do Sapo" />)).toContain('>CS<');
    expect(renderToStaticMarkup(<AvatarDoCanal nome="Canal" imagem="x.png" />)).toContain('src="x.png"');
  });

  it('o nome é o rótulo lido', () => {
    expect(renderToStaticMarkup(<AvatarDoCanal nome="Canal do Sapo" />)).toContain('aria-label="Canal do Sapo"');
  });

  it('iniciais: uma palavra, várias, vazio', () => {
    expect(iniciaisDoCanal('sapo')).toBe('SA');
    expect(iniciaisDoCanal('  Ana  Maria  Souza ')).toBe('AS');
    expect(iniciaisDoCanal('')).toBe('?');
  });
});
