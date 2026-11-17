import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

// D-1122: o `cn` conhece a escala tipográfica da Sala escura como TAMANHO, não como cor.
describe('cn e a escala tipográfica', () => {
  it.each(['micro', 'pequeno', 'corpo', 'linha', 'secao', 'titulo', 'display'])(
    'text-%s convive com a cor do texto',
    (tamanho) => {
      expect(cn(`text-${tamanho}`, 'text-fg')).toBe(`text-${tamanho} text-fg`);
      expect(cn('text-fg', `text-${tamanho}`)).toBe(`text-fg text-${tamanho}`);
    },
  );

  it('dois tamanhos da escala se resolvem: vence o último', () => {
    expect(cn('text-corpo', 'text-pequeno')).toBe('text-pequeno');
  });

  it('o tamanho em px e a cor seguem como antes', () => {
    expect(cn('text-[12px]', 'text-fg', 'text-erro')).toBe('text-[12px] text-erro');
  });
});
