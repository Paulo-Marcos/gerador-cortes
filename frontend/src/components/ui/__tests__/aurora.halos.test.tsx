import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Aurora } from '../aurora';

// D-1127 (auditoria): os halos vêm dos tokens da spec (DIRECAO §2), o véu para cc-bg cobre a
// metade de baixo (§12) e o token trava a força da capa em 0,5 no escuro e 0,3 no claro.
describe('Aurora — halos, véu e força', () => {
  it('os halos usam os tokens da spec, sem opacity própria', () => {
    const h = renderToStaticMarkup(<Aurora />);
    expect(h).toContain('bg-[var(--cc-halo-iris)]');
    expect(h).toContain('bg-[var(--cc-halo-menta)]');
    expect(h).not.toMatch(/opacity-\d/);
  });

  it('o véu para cc-bg cobre a metade de baixo, com e sem capa', () => {
    for (const src of [undefined, 'blob:capa']) {
      const h = renderToStaticMarkup(<Aurora src={src} />);
      expect(h).toContain('h-1/2');
      expect(h).toContain('to_bottom,transparent,var(--cc-bg)');
    }
  });

  it('o token trava a força em 0,5 no escuro e 0,3 no claro', () => {
    const css = readFileSync(resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
    expect([...css.matchAll(/--cc-aurora-forca:\s*([\d.]+)/g)].map((m) => m[1])).toEqual(['0.5', '0.3']);
  });
});
