import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { esquecerFontesDoRender, useFontesDoRender } from '@/lib/fontesDoRender';

// D-1140 (auditoria da D-1139): o hook mantém a prévia oculta até a fonte chegar
// e a libera na transição oculto → pronto. O único dublê é o navegador: o
// `document.fonts.load` fica na mão do teste.
let chegou: () => void = () => {};
const leituras: boolean[] = [];

const Sonda = ({ familias }: { familias: string[] }) => {
  leituras.push(useFontesDoRender(familias));
  return null;
};

function montarComFonte(familias: string[]) {
  const dono = montar(createElement(Sonda, { familias }));
  const documento = (globalThis as unknown as { document: Record<string, unknown> }).document;
  documento.fonts = {
    load: () =>
      new Promise<void>((resolve) => {
        chegou = resolve;
      }),
  };
  documento.head = {
    querySelector: () => null,
    appendChild: (l: { onload?: () => void }) => queueMicrotask(() => l.onload?.()),
  };
  documento.createElement = () => ({ rel: '', href: '' });
  return dono;
}

describe('useFontesDoRender: oculto → pronto', () => {
  let limpar: (() => Promise<void>) | undefined;
  beforeEach(() => {
    esquecerFontesDoRender();
    leituras.length = 0;
  });
  afterEach(async () => {
    await limpar?.();
  });

  it('fica oculto enquanto a fonte não chega e vira pronto quando chega', async () => {
    ({ limpar } = montarComFonte(['Inter']));
    await assentar();
    expect(leituras.length).toBeGreaterThan(0);
    expect(leituras.every((v) => v === false)).toBe(true);

    chegou();
    await assentar();
    expect(leituras.at(-1)).toBe(true);
  });

  it('pedido sem família do render (fonte do canal) nasce pronto, sem esperar', async () => {
    ({ limpar } = montarComFonte([]));
    await assentar();
    expect(leituras.every((v) => v === true)).toBe(true);
  });
});
